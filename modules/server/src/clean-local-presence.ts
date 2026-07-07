import { LocalPresence } from '@colyseus/core';

/**
 * LocalPresence subclass that properly clears pending setTimeout handles on shutdown.
 *
 * LocalPresence.expire() and .hincrbyex() schedule setTimeout calls stored in
 * the internal `timeouts` map. The upstream shutdown() method does not clear
 * these handles, which keeps Jest worker processes alive after tests complete.
 */
export class CleanLocalPresence extends LocalPresence {
    shutdown() {
        // Cast to access the private `timeouts` field declared in LocalPresence.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const timeouts: Record<string, ReturnType<typeof setTimeout>> = (this as any).timeouts;
        for (const key of Object.keys(timeouts)) {
            clearTimeout(timeouts[key]);
            delete timeouts[key];
        }
        super.shutdown();
    }
}
