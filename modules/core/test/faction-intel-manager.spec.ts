import { Asteroid, Faction, FactionIntelManager, ScanLevel, SpaceObject, SpaceState, Spaceship, Vec2 } from '../src';

import { expect } from 'chai';

// Behavior tests for the per-faction intel sub-manager: scan level reads/writes,
// GM command drain, and passive demotion out of line of sight. No SpaceManager,
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
});

describe('FactionIntelManager setScanLevel commands', () => {
    it('applies a queued GM command and consumes the queue', () => {
        const target = makeShip('target', Faction.Raiders);
        const { state, intel } = setup(target);
        state.setScanLevelCommands.push({ targetId: 'target', faction: Faction.Gravitas, level: ScanLevel.BASIC });

        intel.update(1, visibility({ [Faction.Gravitas]: [target] }));

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        expect(state.setScanLevelCommands).to.have.length(0);
    });

    it('rejects a GM command with an out-of-range faction', () => {
        const target = makeShip('target', Faction.Raiders);
        const { state, intel } = setup(target);
        state.setScanLevelCommands.push({ targetId: 'target', faction: Faction.NONE, level: ScanLevel.FULL });

        intel.update(1, visibility());

        expect([...target.scanLevels]).to.deep.equal(Array(Number(Faction.FACTION_COUNT)).fill(Number(ScanLevel.UFO)));
    });
});

describe('FactionIntelManager scan demotion', () => {
    it('demotes FULL to SNAPSHOT and captures the timestamp when the target is out of sight', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);

        intel.update(42, visibility());

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.SNAPSHOT);
        expect(intel.getScanSnapshotCapturedAt('target', Faction.Gravitas)).to.equal(42);
    });

    it('keeps FULL while the target stays visible', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.FULL);

        intel.update(42, visibility({ [Faction.Gravitas]: [target] }));

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.FULL);
        expect(intel.getScanSnapshotCapturedAt('target', Faction.Gravitas)).to.equal(0);
    });

    it('leaves levels below FULL untouched when out of sight', () => {
        const target = makeShip('target', Faction.Raiders);
        const { intel } = setup(target);
        intel.setScanLevel('target', Faction.Gravitas, ScanLevel.BASIC);

        intel.update(42, visibility());

        expect(intel.getScanLevel('target', Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        expect(intel.getScanSnapshotCapturedAt('target', Faction.Gravitas)).to.equal(0);
    });

    it('does not demote non-ship objects', () => {
        const rock = new Asteroid().init('rock', Vec2.make({ x: 0, y: 0 }), 10);
        const { intel } = setup(rock);
        intel.setScanLevel('rock', Faction.Gravitas, ScanLevel.FULL);

        intel.update(42, visibility());

        expect(intel.getScanLevel('rock', Faction.Gravitas)).to.equal(ScanLevel.FULL);
    });
});
