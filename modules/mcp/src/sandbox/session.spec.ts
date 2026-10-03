import { SessionShipDriver, SessionSpaceDriver, StationSession } from './session';

import { RadarView } from '../radar/radar-view';

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
});
