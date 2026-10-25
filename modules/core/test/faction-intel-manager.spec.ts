import {
    Asteroid,
    Faction,
    FactionIntelManager,
    Projectile,
    ScanLevel,
    ShipState,
    SpaceObject,
    SpaceState,
    Spaceship,
    Vec2,
    decodeShipSnapshot,
    encodeShipSnapshot,
    makeShipState,
    shipConfigurations,
} from '../src';

import { expect } from 'chai';

// Behavior tests for the per-faction intel sub-manager: scan level reads/writes,
// GM command drain, and FULL maintenance under scan beams. No SpaceManager,
// no physics — visibility is supplied by the caller.

function makeShip(id: string, faction = Faction.NONE) {
    const ship = new Spaceship();
    ship.id = id;
    ship.faction = faction;
    return ship;
}

function setup(...objects: SpaceObject[]) {
    const state = new SpaceState(false);
    for (const object of objects) {
        state.set(object);
    }
    return { state, intel: new FactionIntelManager(state) };
}

/** Visibility sets indexed by faction, as SpaceManager computes them per tick. */
function visibility(entries: Record<number, SpaceObject[] | undefined> = {}) {
    const byFaction: Set<SpaceObject>[] = [];
    for (let faction = 0; faction < Number(Faction.FACTION_COUNT); faction++) {
        byFaction.push(new Set(entries[faction] ?? []));
    }
    return byFaction;
}

describe('FactionIntelManager scan levels', () => {
    it('stores and reads a scan level per faction', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);

        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.SNAPSHOT);

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.SNAPSHOT);
        expect(intel.getScanLevel('target', Faction.Raiders)).to.equal(ScanLevel.BASIC); // own faction floor
    });

    it('ignores out-of-range factions', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);

        intel.setScanLevel('target', Faction.NONE, ScanLevel.FULL);

        expect(intel.getScanLevel('target', Faction.NONE)).to.equal(ScanLevel.UFO);
        expect([...target.scanLevels]).to.deep.equal(Array(Number(Faction.FACTION_COUNT)).fill(Number(ScanLevel.UFO)));
    });

    it('reads the same level from an object in hand as by its id', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.SNAPSHOT);
        for (const faction of [Faction.Gravitas, Faction.Raiders, Faction.NONE]) {
            expect(intel.getScanLevelOf(target, faction)).to.equal(intel.getScanLevel('target', faction));
        }
        target.destroyed = true;
        expect(intel.getScanLevelOf(target, Faction.Gravitas)).to.equal(ScanLevel.UFO);
        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.UFO);
    });
});

describe('FactionIntelManager setScanLevel commands', () => {
    it('applies a queued GM command and consumes the queue', () => {
        const target = makeShip('target', Faction.Raiders);
        const { state, intel } = setup(target);
        state.setScanLevelCommands.push({ targetId: 'target', faction: Faction.Gravitas, level: ScanLevel.BASIC });

        intel.update(1, 1, visibility({ [Faction.Gravitas]: [target] }));

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        expect(state.setScanLevelCommands).to.have.length(0);
    });

    it('rejects a GM command with an out-of-range faction', () => {
        const target = makeShip('target', Faction.Raiders);
        const { state, intel } = setup(target);
        state.setScanLevelCommands.push({ targetId: 'target', faction: Faction.NONE, level: ScanLevel.FULL });

        intel.update(1, 1, visibility());

        expect([...target.scanLevels]).to.deep.equal(Array(Number(Faction.FACTION_COUNT)).fill(Number(ScanLevel.UFO)));
    });
});

describe('FactionIntelManager grantSnapshot', () => {
    it('grants SNAPSHOT at the given time with the data captured, like a demotion', () => {
        const target = makeShip('target', Faction.Gravitas);
        const { intel } = setup(target);
        intel.encodeShip = () => new Uint8Array([1, 2, 3]);

        intel.grantSnapshot('target', Faction.Raiders, 7);

        expect(intel.getScanLevel('target', Faction.Raiders)).to.equal(ScanLevel.SNAPSHOT);
        expect(intel.getScanSnapshotCapturedAt('target', Faction.Raiders)).to.equal(7);
        expect(intel.getSnapshot('target', Faction.Raiders)?.data).to.deep.equal(new Uint8Array([1, 2, 3]));
    });
});

describe('FactionIntelManager scan demotion', () => {
    it('demotes FULL to SNAPSHOT and captures the timestamp when no friendly scan beam covers the target', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);

        intel.update(42, 1, visibility());

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.SNAPSHOT);
        expect(intel.getScanSnapshotCapturedAt('target', Faction.Gravitas)).to.equal(42);
    });

    it('keeps FULL while a friendly scan beam covers the target', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);

        intel.update(42, 1, visibility({ [Faction.Gravitas]: [target] }));

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.FULL);
        expect(intel.getScanSnapshotCapturedAt('target', Faction.Gravitas)).to.equal(0);
    });

    it('leaves levels below FULL untouched without beam cover', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.BASIC);

        intel.update(42, 1, visibility());

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        expect(intel.getScanSnapshotCapturedAt('target', Faction.Gravitas)).to.equal(0);
    });

    it('does not demote non-ship objects', () => {
        const rock = new Asteroid().init('rock', Vec2.make({ x: 0, y: 0 }), 10);
        const { intel } = setup(rock);
        intel.setScanLevel('rock', Faction.Gravitas, ScanLevel.FULL);

        intel.update(42, 1, visibility());

        expect(intel.getScanLevel('rock', Faction.Gravitas)).to.equal(ScanLevel.FULL);
    });

    it('demotes a missile from FULL to SNAPSHOT without beam cover, like a ship', () => {
        const missile = new Projectile();
        missile.id = 'missile';
        missile.model = 'HiExpMissile';
        const { intel } = setup(missile);
        intel.setScanLevel('missile', Faction.Gravitas, ScanLevel.FULL);

        intel.update(1, 0.3, visibility());
        expect(intel.getScanLevel('missile', Faction.Gravitas)).to.equal(ScanLevel.FULL);
        intel.update(1.3, 0.3, visibility());

        expect(intel.getScanLevel('missile', Faction.Gravitas)).to.equal(ScanLevel.SNAPSHOT);
        expect(intel.getScanSnapshotCapturedAt('missile', Faction.Gravitas)).to.equal(1.3);
    });

    it('keeps a missile at FULL under a friendly scan beam, and always for its firing faction', () => {
        const missile = new Projectile();
        missile.id = 'missile';
        missile.model = 'HiExpMissile';
        missile.shipId = 'shooter';
        const { intel } = setup(missile, makeShip('shooter', Faction.Raiders));
        intel.setScanLevel('missile', Faction.Gravitas, ScanLevel.FULL);
        intel.setScanLevel('missile', Faction.Raiders, ScanLevel.FULL);

        intel.update(42, 1, visibility({ [Faction.Gravitas]: [missile] }));

        expect(intel.getScanLevel('missile', Faction.Gravitas)).to.equal(ScanLevel.FULL);
        expect(intel.getScanLevel('missile', Faction.Raiders)).to.equal(ScanLevel.FULL);
    });

    it('keeps FULL for the firing faction after the firing ship is destroyed', () => {
        const missile = new Projectile();
        missile.id = 'missile';
        missile.model = 'HiExpMissile';
        missile.shipId = 'shooter';
        const { state, intel } = setup(missile, makeShip('shooter', Faction.Raiders));
        intel.setScanLevel('missile', Faction.Raiders, ScanLevel.FULL);
        intel.update(1, 1, visibility());

        state.delete(state.get('shooter') as SpaceObject);
        intel.update(2, 1, visibility());
        intel.update(3, 1, visibility());

        expect(intel.getScanLevel('missile', Faction.Raiders)).to.equal(ScanLevel.FULL);
    });

    it('holds FULL through a beam gap of up to 0.5 s', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);

        intel.update(1, 0.25, visibility());
        intel.update(1.25, 0.25, visibility());

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.FULL);
    });

    it('demotes once the beam gap exceeds 0.5 s, stamping the moment of demotion', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);

        intel.update(1, 0.3, visibility());
        intel.update(1.3, 0.3, visibility());

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.SNAPSHOT);
        expect(intel.getScanSnapshotCapturedAt('target', Faction.Gravitas)).to.equal(1.3);
    });

    it('restarts the grace when the beam returns', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);

        intel.update(1, 0.4, visibility());
        intel.update(1.1, 0.1, visibility({ [Faction.Gravitas]: [target] }));
        intel.update(1.5, 0.4, visibility());

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.FULL);
    });

    it('does not count paused ticks against the grace', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);

        for (let i = 0; i < 10; i++) {
            intel.update(1, 0, visibility());
        }

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.FULL);
    });
});

describe('FactionIntelManager snapshot store', () => {
    function setupWithShipState() {
        const target = makeShip('target'); // no faction, so both factions can scan it
        const { state, intel } = setup(target);
        const targetState = makeShipState('target', shipConfigurations['dragonfly-MK1']);
        const shipStates = new Map<string, ShipState>([['target', targetState]]);
        intel.encodeShip = (id) => {
            const shipState = shipStates.get(id);
            return shipState && encodeShipSnapshot(shipState);
        };
        return { state, intel, target, targetState };
    }

    function demote(intel: FactionIntelManager, faction: Faction, atSeconds: number) {
        intel.setScanLevel('target', faction, ScanLevel.FULL);
        intel.update(atSeconds, 1, visibility());
    }

    it('captures the target ship state on FULL to SNAPSHOT demotion', () => {
        const { intel, targetState } = setupWithShipState();
        targetState.armor.armorPlates[0].layers[0].health = 7;

        demote(intel, Faction.Gravitas, 42);

        const snapshot = intel.getSnapshot('target', Faction.Gravitas);
        expect(snapshot?.capturedAt).to.equal(42);
        const decoded = decodeShipSnapshot(snapshot!.data);
        expect(decoded.id).to.equal('target');
        expect(decoded.armor.armorPlates[0].layers[0].health).to.equal(7);
    });

    it('is frozen: damage after demotion does not change the snapshot', () => {
        const { intel, targetState } = setupWithShipState();
        targetState.armor.armorPlates[0].layers[0].health = 7;
        demote(intel, Faction.Gravitas, 42);

        targetState.armor.armorPlates[0].layers[0].health = 1;
        intel.update(43, 1, visibility());

        const decoded = decodeShipSnapshot(intel.getSnapshot('target', Faction.Gravitas)!.data);
        expect(decoded.armor.armorPlates[0].layers[0].health).to.equal(7);
    });

    it('keeps factions independent', () => {
        const { intel, targetState } = setupWithShipState();
        targetState.armor.armorPlates[0].layers[0].health = 7;
        demote(intel, Faction.Gravitas, 42);
        targetState.armor.armorPlates[0].layers[0].health = 3;

        expect(intel.getSnapshot('target', Faction.Raiders)).to.equal(undefined);
        demote(intel, Faction.Raiders, 50);

        const first = decodeShipSnapshot(intel.getSnapshot('target', Faction.Gravitas)!.data);
        const second = decodeShipSnapshot(intel.getSnapshot('target', Faction.Raiders)!.data);
        expect(first.armor.armorPlates[0].layers[0].health).to.equal(7);
        expect(second.armor.armorPlates[0].layers[0].health).to.equal(3);
    });

    it('overwrites the snapshot on the next demotion and keeps it through re-promotion', () => {
        const { intel, targetState } = setupWithShipState();
        demote(intel, Faction.Gravitas, 42);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);
        expect(intel.getSnapshot('target', Faction.Gravitas)?.capturedAt).to.equal(42);

        targetState.armor.armorPlates[0].layers[0].health = 2;
        intel.update(60, 1, visibility());

        const snapshot = intel.getSnapshot('target', Faction.Gravitas)!;
        expect(snapshot.capturedAt).to.equal(60);
        expect(decodeShipSnapshot(snapshot.data).armor.armorPlates[0].layers[0].health).to.equal(2);
    });

    it('clears the snapshot when the target is destroyed', () => {
        const { intel, target } = setupWithShipState();
        demote(intel, Faction.Gravitas, 42);

        target.destroyed = true;
        intel.update(43, 1, visibility());
        target.destroyed = false;

        expect(intel.getSnapshot('target', Faction.Gravitas)).to.equal(undefined);
    });

    it('has no snapshot for a GM-set SNAPSHOT that was never captured', () => {
        const { intel } = setupWithShipState();
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.SNAPSHOT);
        intel.update(42, 1, visibility());

        expect(intel.getSnapshot('target', Faction.Gravitas)).to.equal(undefined);
    });

    it('reports how old a snapshot is in game seconds', () => {
        const { intel } = setupWithShipState();
        demote(intel, Faction.Gravitas, 42);
        intel.update(50, 1, visibility());

        expect(intel.getSnapshotAge('target', Faction.Gravitas)).to.equal(8);
    });
});
