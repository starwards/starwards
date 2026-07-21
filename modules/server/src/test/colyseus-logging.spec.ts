import { makeDriver } from './driver';

// This test verifies that Colyseus lifecycle logging is suppressed when running
// under Jest (JEST_WORKER_ID is set), so test output stays clean.
describe('Colyseus logger suppression', () => {
    makeDriver();

    it('does not call console when Colyseus logger fires under JEST_WORKER_ID', () => {
        expect(process.env.JEST_WORKER_ID).toBeDefined();
        const consoleSpy = jest.spyOn(console, 'info').mockReturnValue(undefined);
        // Access logger via module reference (not destructured import) so we see
        // the current logger value after server() has set it in beforeEach.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const colyseusCore = require('@colyseus/core') as { logger: { info: (...args: unknown[]) => void } };
        colyseusCore.logger.info('room lifecycle message');
        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
