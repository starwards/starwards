import { WarheadDesign, ammoDesigns } from '@starwards/core';
import { recordingIntervalMs } from '../server';

describe('recordingIntervalMs (issue #2343)', () => {
    it.each([{}, { STARWARDS_RECORDING_INTERVAL_MS: '' }])('defaults to 35 ms when unset (%p)', (env) => {
        expect(recordingIntervalMs(env)).toBe(35);
    });

    it('reads STARWARDS_RECORDING_INTERVAL_MS', () => {
        expect(recordingIntervalMs({ STARWARDS_RECORDING_INTERVAL_MS: '100' })).toBe(100);
    });

    it.each(['0', '-5', 'abc', '1.5'])('rejects invalid value %p', (value) => {
        expect(() => recordingIntervalMs({ STARWARDS_RECORDING_INTERVAL_MS: value })).toThrow(
            /STARWARDS_RECORDING_INTERVAL_MS/,
        );
    });

    it('captures at least 3 frames of the shortest-lived blast by default', () => {
        const shortestMs = Math.min(
            ...Object.values(ammoDesigns).flatMap((d: WarheadDesign) =>
                d.delivery === 'explosion' ? [d.explosion.secondsToLive * 1000] : [],
            ),
        );
        expect(Math.floor(shortestMs / recordingIntervalMs({}))).toBeGreaterThanOrEqual(3);
    });
});
