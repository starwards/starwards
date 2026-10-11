import { WarheadDesign, ammoDesigns, isShellAmmo } from '@starwards/core';
import { recordingIntervalMs } from '../server';

describe('recordingIntervalMs (issue #2343)', () => {
    it.each([{}, { STARWARDS_RECORDING_INTERVAL_MS: '' }])('defaults to 100 ms when unset (%p)', (env) => {
        expect(recordingIntervalMs(env)).toBe(100);
    });

    it('reads STARWARDS_RECORDING_INTERVAL_MS', () => {
        expect(recordingIntervalMs({ STARWARDS_RECORDING_INTERVAL_MS: '250' })).toBe(250);
    });

    it.each(['0', '-5', 'abc', '1.5'])('rejects invalid value %p', (value) => {
        expect(() => recordingIntervalMs({ STARWARDS_RECORDING_INTERVAL_MS: value })).toThrow(
            /STARWARDS_RECORDING_INTERVAL_MS/,
        );
    });

    it('captures at least 3 frames of every shell blast by default', () => {
        const shellBlastsMs = Object.entries(ammoDesigns).flatMap(([ammo, d]: [string, WarheadDesign]) =>
            isShellAmmo(ammo as keyof typeof ammoDesigns) && d.delivery === 'explosion'
                ? [d.explosion.secondsToLive * 1000]
                : [],
        );
        expect(shellBlastsMs.length).toBeGreaterThan(0);
        expect(recordingIntervalMs({})).toBeLessThanOrEqual(Math.min(...shellBlastsMs) / 3);
    });
});
