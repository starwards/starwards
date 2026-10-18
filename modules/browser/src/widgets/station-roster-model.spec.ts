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
    it('an empty bridge has every seat with screens unassigned', () => {
        const m = model([]);
        expect(m.ships[0]?.seats.map((s) => [s.seat, s.unassigned])).toEqual([
            ['pilot', true],
            ['weapons', true],
            ['engineer', true],
            ['sigint', true],
            ['tactical', false],
        ]);
    });

    it('lists tactical as a bot-only seat with no screens', () => {
        const bot = { brain: 'reference', status: 'running', message: '' };
        expect(seatOf(model([]), 'tactical')?.screens).toEqual([]);
        expect(seatOf(model([], { 'S1|tactical': bot }), 'tactical')?.bot).toEqual(bot);
    });

    it('blocks the bots of seats that conflict with a seated bot, not their screens', () => {
        const bot = { brain: 'reference', status: 'running', message: '' };
        const withTactical = model([], { 'S1|tactical': bot });
        expect(withTactical.ships[0]?.seats.map((s) => [s.seat, s.botBlockedBy])).toEqual([
            ['pilot', 'tactical'],
            ['weapons', 'tactical'],
            ['engineer', null],
            ['sigint', null],
            ['tactical', null],
        ]);
        expect(seatOf(withTactical, 'pilot')?.screens.map((s) => s.screen)).toEqual(['helms']);
        expect(seatOf(model([], { 'S1|weapons': bot }), 'tactical')?.botBlockedBy).toBe('weapons');
    });

    it('a seat whose station a conflicting seated bot plays is not unassigned', () => {
        const bot = { brain: 'reference', status: 'running', message: '' };
        const m = model([], { 'S1|tactical': bot });
        expect(seatOf(m, 'pilot')?.unassigned).toBe(false);
        expect(seatOf(m, 'weapons')?.unassigned).toBe(false);
        expect(seatOf(m, 'engineer')?.unassigned).toBe(true);
    });

    it('counts starting and running bots as running, not failed ones', () => {
        const bot = (status: string) => ({ brain: 'reference', status, message: '' });
        expect(model([]).botsRunning).toBe(false);
        expect(model([], { 'S1|pilot': bot('failed') }).botsRunning).toBe(false);
        expect(model([], { 'S1|pilot': bot('starting') }).botsRunning).toBe(true);
        expect(model([], { 'S1|pilot': bot('failed'), 'S1|sigint': bot('running') }).botsRunning).toBe(true);
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
