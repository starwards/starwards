import * as fs from 'node:fs';

/**
 * DuckDB's Windows native file handle can lag well behind its `close()` callback firing --
 * sometimes several seconds when the store did a lot of writes. Retries for a while, then gives
 * up silently: this is best-effort cleanup of an OS temp directory, not a correctness concern,
 * so a slow release should never fail the test that already got its assertions in.
 * The budget stays under jest's 5 s default hook timeout, since callers use it from a bare `afterEach`.
 */
export async function rmDirRetrying(dir: string): Promise<void> {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
    }
}
