import { SessionShipDriver, SessionSpaceDriver, StationSession } from './session';

import { RadarView } from './radar-view';

describe('StationSession', () => {
    it('holds a burst for the requested seconds through the injected wait, then releases the trigger', async () => {
        const sent: [string, unknown][] = [];
        const shipDriver = {
            id: 'ship',
            state: { chainGuns: [{}] },
            systems: [],
            sendJsonCmd: (pointer: string, value: unknown) => sent.push([pointer, value]),
            command: () => undefined,
        } as unknown as SessionShipDriver;
        const waits: number[] = [];
        const wait = (seconds: number) => {
            waits.push(seconds);
            expect(sent).toEqual([['/chainGuns/0/isFiring', true]]);
            return Promise.resolve();
        };
        const session = new StationSession(
            'weapons',
            { enabled: true, commands: ['fireChainGun'] },
            shipDriver,
            {} as SessionSpaceDriver,
            { radar: {} as RadarView, wait },
        );

        await session.execute('fireChainGun', { index: 0, seconds: 1.5 });

        expect(waits).toEqual([1.5]);
        expect(sent).toEqual([
            ['/chainGuns/0/isFiring', true],
            ['/chainGuns/0/isFiring', false],
        ]);
    });

    describe('release', () => {
        const make = (commands: string[]) => {
            const sent: [string, unknown][] = [];
            const shipDriver = {
                id: 'ship',
                state: { chainGuns: [{}], smartPilot: { rotation: 0 }, afterBurnerCommand: 0, breaks: 0 },
                systems: [],
                sendJsonCmd: (pointer: string, value: unknown) => sent.push([pointer, value]),
                command: () => undefined,
            } as unknown as SessionShipDriver;
            // a paused game: only an abort ends the hold
            const wait = (_: number, signal: AbortSignal) =>
                new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
            const session = new StationSession(
                'station',
                { enabled: true, commands: commands as never },
                shipDriver,
                {} as SessionSpaceDriver,
                { radar: {} as RadarView, wait },
            );
            return { sent, session };
        };

        it('lets go of a held trigger at once, whatever the game clock does', async () => {
            const { sent, session } = make(['fireChainGun']);
            const burst = session.execute('fireChainGun', { index: 0, seconds: 5 });
            expect(sent).toEqual([['/chainGuns/0/isFiring', true]]);
            session.release();
            await burst;
            expect(sent).toEqual([
                ['/chainGuns/0/isFiring', true],
                ['/chainGuns/0/isFiring', false],
            ]);
        });

        it('springs every held control it moved back to rest, and leaves set-and-forget values alone', async () => {
            const { sent, session } = make(['rotation', 'afterBurner', 'breaks', 'targetEnemyOnly', 'warpUp']);
            await session.execute('rotation', {}, 0.7);
            await session.execute('afterBurner', {}, 1);
            await session.execute('targetEnemyOnly', {}, true);
            await session.execute('warpUp');
            sent.length = 0;
            session.release();
            expect(sent).toEqual([
                ['/smartPilot/rotation', 0],
                ['/afterBurnerCommand', 0],
            ]);
        });

        it('refuses every command after', async () => {
            const { sent, session } = make(['fireChainGun', 'rotation']);
            session.release();
            await expect(session.execute('fireChainGun', { index: 0 })).rejects.toThrow('was released');
            await expect(session.execute('rotation', {}, 1)).rejects.toThrow('was released');
            expect(sent).toEqual([]);
        });
    });
});
