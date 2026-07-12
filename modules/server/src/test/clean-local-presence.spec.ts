import { CleanLocalPresence } from '../clean-local-presence';

describe('CleanLocalPresence', () => {
    it('shutdown clears all pending expire timeouts', () => {
        const presence = new CleanLocalPresence();
        presence.expire('key1', 60);
        presence.expire('key2', 60);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        expect(Object.keys((presence as any).timeouts)).toHaveLength(2);

        presence.shutdown();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        expect(Object.keys((presence as any).timeouts)).toHaveLength(0);
    });

    it('shutdown clears pending hincrbyex timeouts', async () => {
        const presence = new CleanLocalPresence();
        await presence.hincrbyex('key1', 'field', 1, 60);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        expect(Object.keys((presence as any).timeouts)).toHaveLength(1);

        presence.shutdown();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        expect(Object.keys((presence as any).timeouts)).toHaveLength(0);
    });

    it('shutdown tolerates an empty timeout map', () => {
        const presence = new CleanLocalPresence();
        expect(() => presence.shutdown()).not.toThrow();
    });
});
