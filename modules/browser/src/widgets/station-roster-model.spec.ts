import { rosterModel } from './station-roster-model';

const allScreens = ['helms', 'weapons', 'engineer', 'signals', 'dradis', 'target-details'];
type Entry = { id: string; connected: boolean; shipId: string; stationType: string };

function model(stations: Entry[], bots: Record<string, { brain: string; status: string; message: string }> = {}) {
    return rosterModel({
        playerShipIds: ['S1'],
        stations,
        bots: (shipId, seat) => bots[`${shipId}|${seat}`],
        enabledScreens: () => allScreens.filter((s) => s !== 'target-details'),
    });
}
const seatOf = (m: ReturnType<typeof model>, seat: string) => m.ships[0]?.seats.find((s) => s.seat === seat);

describe('rosterModel', () => {
    it('an empty bridge has every roster seat unassigned', () => {
        const m = model([]);
        expect(m.ships[0]?.seats.map((s) => [s.seat, s.unassigned])).toEqual([
            ['pilot', true],
            ['weapons', true],
            ['engineer', true],
            ['sigint', true],
        ]);
    });

    it('a client on dradis holds that screen and assigns sigint', () => {
        const client = { id: 'abc', connected: true, shipId: 'S1', stationType: 'dradis' };
        const sigint = seatOf(model([client]), 'sigint');
        expect(sigint?.unassigned).toBe(false);
        expect(sigint?.screens.find((s) => s.screen === 'dradis')?.holder).toBe(client);
        expect(sigint?.screens.find((s) => s.screen === 'signals')?.holder).toBeNull();
    });

    it('a bot on pilot assigns it', () => {
        const bot = { brain: 'reference', status: 'running', message: '' };
        const pilot = seatOf(model([], { 'S1|pilot': bot }), 'pilot');
        expect(pilot?.bot).toEqual(bot);
        expect(pilot?.unassigned).toBe(false);
    });

    it('omits a screen the manifest does not enable', () => {
        expect(seatOf(model([]), 'sigint')?.screens.map((s) => s.screen)).toEqual(['signals', 'dradis']);
    });

    it('lists connected clients with no ship as unassigned, not disconnected ones', () => {
        const m = model([
            { id: 'on', connected: true, shipId: '', stationType: '' },
            { id: 'off', connected: false, shipId: '', stationType: '' },
            { id: 'seated', connected: true, shipId: 'S1', stationType: 'helms' },
        ]);
        expect(m.unassignedClients).toEqual(['on']);
    });

    it('a connected client holds a screen over a stale disconnected entry', () => {
        const stale = { id: 'old', connected: false, shipId: 'S1', stationType: 'helms' };
        const live = { id: 'new', connected: true, shipId: 'S1', stationType: 'helms' };
        const m = model([stale, live]);
        expect(seatOf(m, 'pilot')?.screens[0]?.holder).toBe(live);
        expect(m.unassignedClients).toEqual([]);
    });

    it('lists a connected client on a ship or screen the roster does not show as unassigned', () => {
        const m = model([
            { id: 'ghost-ship', connected: true, shipId: 'X', stationType: 'helms' },
            { id: 'hidden-screen', connected: true, shipId: 'S1', stationType: 'target-details' },
        ]);
        expect(m.unassignedClients).toEqual(['ghost-ship', 'hidden-screen']);
    });
});
