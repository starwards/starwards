import { recordingIntervalMs } from '../server';

describe('recordingIntervalMs (issue #2343)', () => {
    it.each([{}, { STARWARDS_RECORDING_INTERVAL_MS: '' }])('defaults to 1000 ms when unset (%p)', (env) => {
        expect(recordingIntervalMs(env)).toBe(1000);
    });

    it('reads STARWARDS_RECORDING_INTERVAL_MS', () => {
        expect(recordingIntervalMs({ STARWARDS_RECORDING_INTERVAL_MS: '100' })).toBe(100);
    });

    it.each(['0', '-5', 'abc', '1.5'])('rejects invalid value %p', (value) => {
        expect(() => recordingIntervalMs({ STARWARDS_RECORDING_INTERVAL_MS: value })).toThrow(
            /STARWARDS_RECORDING_INTERVAL_MS/,
        );
    });
});
