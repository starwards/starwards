import { WarheadDesign, ammoDesigns, isShellAmmo } from '@starwards/core';
import { recordingIntervalMs } from '../server';

/** the rooms' patch interval (`@colyseus/core` Room default), the time resolution of delta recordings */
const PATCH_RATE_MS = 50;

const shellBlastsMs = () =>
    Object.entries(ammoDesigns).flatMap(([ammo, d]: [string, WarheadDesign]) =>
        isShellAmmo(ammo as keyof typeof ammoDesigns) && d.delivery === 'explosion'
            ? [d.explosion.secondsToLive * 1000]
            : [],
    );

describe('recordingIntervalMs (issue #2343, SPEC-0006)', () => {
    it.each([{}, { STARWARDS_RECORDING_INTERVAL_MS: '' }])('defaults to 1000 ms keyframes with deltas (%p)', (env) => {
        expect(recordingIntervalMs(env)).toBe(1000);
    });

    it('defaults to 100 ms snapshots with deltas off', () => {
        expect(recordingIntervalMs({ STARWARDS_RECORDING_DELTAS: '0' })).toBe(100);
    });

    it('reads STARWARDS_RECORDING_INTERVAL_MS', () => {
        expect(recordingIntervalMs({ STARWARDS_RECORDING_INTERVAL_MS: '250' })).toBe(250);
    });

    it.each(['0', '-5', 'abc', '1.5'])('rejects invalid value %p', (value) => {
        expect(() => recordingIntervalMs({ STARWARDS_RECORDING_INTERVAL_MS: value })).toThrow(
            /STARWARDS_RECORDING_INTERVAL_MS/,
        );
    });

    it('captures at least 3 states of every shell blast, with deltas or without', () => {
        expect(shellBlastsMs().length).toBeGreaterThan(0);
        expect(PATCH_RATE_MS).toBeLessThanOrEqual(Math.min(...shellBlastsMs()) / 3);
        expect(recordingIntervalMs({ STARWARDS_RECORDING_DELTAS: '0' })).toBeLessThanOrEqual(
            Math.min(...shellBlastsMs()) / 3,
        );
    });
});
