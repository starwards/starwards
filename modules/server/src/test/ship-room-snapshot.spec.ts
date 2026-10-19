import {
    Faction,
    NEED_SNAPSHOT,
    NeedSnapshotMessage,
    SNAPSHOT,
    ScanLevel,
    SnapshotMessage,
    decodeShipSnapshot,
    sleep,
} from '@starwards/core/internal';
import { makeMultiClientDriver } from './multi-client-driver';
import supertest from 'supertest';

// SPEC-0008 snapshot fetch over ShipRoom messages: `needSnapshot` -> `snapshot`, faction-scoped.
// two_vs_one: GVTS and GVTS2 are Gravitas player ships, R2D2 a Raiders NPC.

describe('ShipRoom snapshot fetch', () => {
    const driver = makeMultiClientDriver();
    if (process.env.CI) {
        jest.setTimeout(100_000);
    }

    beforeEach(async () => {
        await supertest(driver.serverDriver.httpServer).post('/start-game').send({ mapName: 'two_vs_one' }).expect(200);
        driver.serverDriver.gameManager.state.speed = 0; // pause: demotion is driven by hand below
    });

    const intel = () => driver.serverDriver.gameManager.spaceManager.factionIntel;
    const setPlateHealth = (health: number) => {
        driver.serverDriver.getShip('R2D2').state.armor.armorPlates[0].layers[0].health = health;
    };

    /** FULL -> SNAPSHOT for Gravitas on R2D2, as the scan-beam grace would do */
    function demoteForGravitas(atSeconds: number) {
        intel().setScanLevel('R2D2', Faction.Gravitas, ScanLevel.FULL);
        intel().update(atSeconds, 1, []);
        expect(intel().getScanLevel('R2D2', Faction.Gravitas)).toBe(ScanLevel.SNAPSHOT);
    }

    async function connect(name: string, shipId: string) {
        const client = driver.createClient(name);
        const room = await client.connectShip(shipId);
        await client.waitForSync(room);
        const received: SnapshotMessage[] = [];
        room.onMessage(SNAPSHOT, (msg: SnapshotMessage) => received.push(msg));
        const ask = (msg: NeedSnapshotMessage) => room.send(NEED_SNAPSHOT, msg);
        return { received, ask };
    }

    async function settle() {
        await sleep(300);
    }

    it("replies with the requesting ship's faction snapshot", async () => {
        setPlateHealth(7);
        demoteForGravitas(42);
        setPlateHealth(1);
        const { received, ask } = await connect('signals', 'GVTS');

        ask({ targetId: 'R2D2' });
        await settle();

        expect(received).toHaveLength(1);
        expect(received[0].targetId).toBe('R2D2');
        expect(received[0].capturedAt).toBe(42);
        const state = decodeShipSnapshot(received[0].data);
        expect(state.armor.armorPlates[0].layers[0].health).toBe(7);
    });

    it('gives two ships of one faction identical snapshots', async () => {
        demoteForGravitas(42);
        const first = await connect('a', 'GVTS');
        const second = await connect('b', 'GVTS2');

        first.ask({ targetId: 'R2D2' });
        second.ask({ targetId: 'R2D2' });
        await settle();

        expect(first.received).toHaveLength(1);
        expect(second.received).toHaveLength(1);
        expect(Buffer.from(first.received[0].data).equals(Buffer.from(second.received[0].data))).toBe(true);
    });

    it('sends nothing when the held snapshot is already the latest', async () => {
        demoteForGravitas(42);
        const { received, ask } = await connect('signals', 'GVTS');

        ask({ targetId: 'R2D2', haveCapturedAt: 42 });
        await settle();

        expect(received).toHaveLength(0);
    });

    it("sends nothing when the ship's faction has no snapshot", async () => {
        intel().setScanLevel('R2D2', Faction.Gravitas, ScanLevel.SNAPSHOT); // GM-set, never captured
        const { received, ask } = await connect('signals', 'GVTS');

        ask({ targetId: 'R2D2' });
        ask({ targetId: 'no-such-ship' });
        await settle();

        expect(received).toHaveLength(0);
    });
});
