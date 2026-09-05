import { GameManager } from '../admin/game-manager';

// Pure unit tests for GameManager's stale-station prune (issue #2131 review): no server/room
// involved, so real time can be faked instead of actually waiting out the 30s grace period.

describe('GameManager station registry pruning', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function register(gm: GameManager, stationId: string, stationType = '') {
        gm.state.registerStationCommands.push({ stationId, stationType, shipId: '' });
        gm.update(0);
    }
    function disconnect(gm: GameManager, stationId: string) {
        gm.state.disconnectStationCommands.push(stationId);
        gm.update(0);
    }

    it('removes a disconnected, unassigned station once the grace period elapses', () => {
        const gm = new GameManager();
        register(gm, 'AAA');
        disconnect(gm, 'AAA');
        expect(gm.state.stations.get('AAA')).toBeDefined();

        jest.setSystemTime(Date.now() + 31_000);
        gm.update(0);
        expect(gm.state.stations.get('AAA')).toBeUndefined();
    });

    it('does not remove a station before the grace period elapses', () => {
        const gm = new GameManager();
        register(gm, 'BBB');
        disconnect(gm, 'BBB');

        jest.setSystemTime(Date.now() + 5_000);
        gm.update(0);
        expect(gm.state.stations.get('BBB')).toBeDefined();
    });

    it('keeps a disconnected station that still holds a ship assignment', () => {
        const gm = new GameManager();
        // A real (if minimal) valid slot, set up directly on state — no matchmaker/room needed
        // for this pure unit test — so `reconcileStationAssignments` doesn't itself clear the
        // assignment as invalid before the prune ever gets a chance to look at it.
        gm.state.playerShipIds.push('SOME-SHIP');
        register(gm, 'CCC', 'pilot');
        gm.state.stations.get('CCC')!.shipId = 'SOME-SHIP';
        disconnect(gm, 'CCC');

        jest.setSystemTime(Date.now() + 31_000);
        gm.update(0);
        expect(gm.state.stations.get('CCC')).toMatchObject({ connected: false, shipId: 'SOME-SHIP' });
    });

    it('cancels the prune when the station reconnects before the grace period', () => {
        const gm = new GameManager();
        register(gm, 'DDD');
        disconnect(gm, 'DDD');

        jest.setSystemTime(Date.now() + 5_000);
        register(gm, 'DDD');

        jest.setSystemTime(Date.now() + 31_000);
        gm.update(0);
        expect(gm.state.stations.get('DDD')).toBeDefined();
    });
});
