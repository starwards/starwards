import {
    Asteroid,
    Faction,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    TargetedStatus,
    Vec2,
    Waypoint,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { ShipManager } from '../src/ship/ship-manager-abstract';
import { expect } from 'chai';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

// Behavior tests for the weapons-target lifecycle, targeted status, radar
// malfunction and magazine clamping in ShipManager (ship-manager-abstract.ts).

function setup() {
    const spaceMgr = new SpaceManager();
    const ships = new Map<string, ShipManager>();
    const makeShipMgr = (id: string, faction: Faction, x = 0, y = 0) => {
        const obj = new Spaceship();
        obj.id = id;
        obj.faction = faction;
        obj.position.x = x;
        obj.position.y = y;
        obj.radarRange = 10_000;
        const die = new MockDie();
        die.expectedRoll = 1;
        const mgr = new ShipManagerPc(obj, makeShipState(id, dragonflyConfig), spaceMgr, die, ships);
        mgr.state.spaceship.faction = faction; // normally synced from the space object on update
        ships.set(id, mgr);
        spaceMgr.insert(obj);
        mgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        mgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        return { obj, mgr };
    };
    const flush = () => spaceMgr.forceFlushEntities();
    const runTick = (mgr: ShipManager) => {
        for (const id of makeIterationsData(1, 20)) {
            mgr.update(id);
            spaceMgr.update(id);
        }
    };
    return { spaceMgr, ships, makeShipMgr, flush, runTick };
}

describe('ShipManager weapons target lifecycle', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('setTarget accepts a target within radar range', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        const { obj: target } = makeShipMgr('c', Faction.Gravitas, 1000, 0);
        flush();
        mgr.setTarget('c');
        expect(mgr.state.weaponsTarget.targetId).to.equal('c');
        expect(mgr.weaponsTarget).to.equal(target);
    });

    it('setTarget drops a target beyond radar range', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        makeShipMgr('far', Faction.Gravitas, 50_000, 0);
        flush();
        mgr.setTarget('far');
        expect(mgr.state.weaponsTarget.targetId).to.equal(null);
        expect(mgr.weaponsTarget).to.equal(null);
    });

    it('setTarget drops an unknown target id', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        flush();
        mgr.setTarget('no-such-ship');
        expect(mgr.state.weaponsTarget.targetId).to.equal(null);
    });

    it('target is dropped after it is destroyed and garbage-collected', () => {
        const { spaceMgr, makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        makeShipMgr('c', Faction.Gravitas, 1000, 0);
        flush();
        mgr.setTarget('c');
        expect(mgr.state.weaponsTarget.targetId).to.equal('c');
        spaceMgr.destroyObject('c');
        spaceMgr.update({ deltaSeconds: 6, deltaSecondsAvg: 6, totalSeconds: 6 }); // trigger GC
        mgr.update({ deltaSeconds: 0.05, deltaSecondsAvg: 0.05, totalSeconds: 6.05 });
        expect(mgr.state.weaponsTarget.targetId).to.equal(null);
    });

    it('nextTargetCommand selects a visible ship (not asteroids) and resets the flag', () => {
        const { spaceMgr, makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        makeShipMgr('c', Faction.Gravitas, 1000, 0);
        spaceMgr.insert(new Asteroid().init('rock', Vec2.make({ x: 500, y: 0 }), 10));
        flush();
        mgr.state.weaponsTarget.shipOnly = true;
        mgr.state.weaponsTarget.enemyOnly = false;
        mgr.state.weaponsTarget.nextTargetCommand = true;
        mgr.handleTargetCommands();
        expect(mgr.state.weaponsTarget.targetId).to.equal('c');
        expect(mgr.state.weaponsTarget.nextTargetCommand).to.equal(false);
    });

    it('nextTargetCommand never selects a waypoint', () => {
        const { spaceMgr, makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        const waypoint = new Waypoint().init('wp', Vec2.make({ x: 500, y: 0 }));
        waypoint.faction = Faction.Gravitas;
        spaceMgr.insert(waypoint);
        flush();
        mgr.state.weaponsTarget.shipOnly = false;
        mgr.state.weaponsTarget.enemyOnly = false;
        mgr.state.weaponsTarget.nextTargetCommand = true;
        mgr.handleTargetCommands();
        expect(mgr.state.weaponsTarget.targetId).to.equal(null);
    });

    it('setTarget rejects a waypoint id', () => {
        const { spaceMgr, makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        const waypoint = new Waypoint().init('wp', Vec2.make({ x: 500, y: 0 }));
        waypoint.faction = Faction.Gravitas;
        spaceMgr.insert(waypoint);
        flush();
        mgr.setTarget('wp');
        expect(mgr.state.weaponsTarget.targetId).to.equal(null);
        expect(mgr.weaponsTarget).to.equal(null);
    });

    it('nextTargetCommand with enemyOnly skips same-faction ships', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        makeShipMgr('friend', Faction.Gravitas, 1000, 0);
        flush();
        mgr.state.weaponsTarget.shipOnly = true;
        mgr.state.weaponsTarget.enemyOnly = true;
        mgr.state.weaponsTarget.nextTargetCommand = true;
        mgr.handleTargetCommands();
        expect(mgr.state.weaponsTarget.targetId).to.equal(null);
    });

    it('nextTargetCommand acquires a visible enemy ship when enemyOnly is set', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        makeShipMgr('e', Faction.Raiders, 2000, 0);
        flush();
        mgr.state.weaponsTarget.shipOnly = true;
        mgr.state.weaponsTarget.enemyOnly = true;
        mgr.state.weaponsTarget.nextTargetCommand = true;
        mgr.handleTargetCommands();
        expect(mgr.state.weaponsTarget.targetId).to.equal('e');
    });

    it('prevTargetCommand selects from viable targets', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        makeShipMgr('c', Faction.Gravitas, 1000, 0);
        flush();
        mgr.state.weaponsTarget.shipOnly = true;
        mgr.state.weaponsTarget.prevTargetCommand = true;
        mgr.handleTargetCommands();
        expect(mgr.state.weaponsTarget.targetId).to.equal('c');
        expect(mgr.state.weaponsTarget.prevTargetCommand).to.equal(false);
    });

    it('clearTargetCommand clears the current target and resets the flag', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        makeShipMgr('c', Faction.Gravitas, 1000, 0);
        flush();
        mgr.setTarget('c');
        mgr.state.weaponsTarget.clearTargetCommand = true;
        mgr.handleTargetCommands();
        expect(mgr.state.weaponsTarget.targetId).to.equal(null);
        expect(mgr.state.weaponsTarget.clearTargetCommand).to.equal(false);
    });
});

describe('ShipManager targeted status', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('ship is LOCKED when another ship targets it', () => {
        const { makeShipMgr, flush, runTick } = setup();
        const a = makeShipMgr('a', Faction.Gravitas);
        const b = makeShipMgr('b', Faction.Raiders, 1000, 0);
        flush();
        b.mgr.setTarget('a');
        runTick(a.mgr);
        expect(a.mgr.state.targeted).to.equal(TargetedStatus.LOCKED);
    });

    it('ship is FIRED_UPON when the targeting ship is firing its chain gun', () => {
        const { makeShipMgr, flush, runTick } = setup();
        const a = makeShipMgr('a', Faction.Gravitas);
        const b = makeShipMgr('b', Faction.Raiders, 1000, 0);
        flush();
        b.mgr.setTarget('a');
        b.mgr.state.chainGun!.isFiring = true;
        runTick(a.mgr);
        expect(a.mgr.state.targeted).to.equal(TargetedStatus.FIRED_UPON);
    });

    it('targeted status resets to NONE when the attacker clears its target', () => {
        const { makeShipMgr, flush, runTick } = setup();
        const a = makeShipMgr('a', Faction.Gravitas);
        const b = makeShipMgr('b', Faction.Raiders, 1000, 0);
        flush();
        b.mgr.setTarget('a');
        runTick(a.mgr);
        expect(a.mgr.state.targeted).to.equal(TargetedStatus.LOCKED);
        b.mgr.setTarget(null);
        runTick(a.mgr);
        expect(a.mgr.state.targeted).to.equal(TargetedStatus.NONE);
    });
});

describe('ShipManager housekeeping', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('ammo counts are clamped when magazine capacity drops', () => {
        const { makeShipMgr, flush, runTick } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        flush();
        const magazine = mgr.state.magazine;
        expect(magazine.count_HiExpShell).to.equal(magazine.design.max_HiExpShell);
        magazine.capacity = 0.5;
        runTick(mgr);
        expect(magazine.count_HiExpShell).to.equal(magazine.max_HiExpShell);
        expect(magazine.count_HiExpShell).to.be.lessThan(magazine.design.max_HiExpShell);
    });

    it('damaged armor plates heal at the design heal rate', () => {
        const { makeShipMgr, flush, runTick } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        flush();
        const armor = mgr.state.armor;
        const layer = armor.armorPlates[0].layers[0];
        layer.health = 0;
        runTick(mgr); // one second of healing
        const layerDesign = armor.layerDesigns[0];
        const expected = Math.min(layerDesign.healRate, layerDesign.plateMaxHealth);
        expect(layer.health).to.be.closeTo(expected, 0.5);
    });

    it('radar malfunction reduces radar range toward the malfunction range', () => {
        const { makeShipMgr, flush, runTick } = setup();
        const { obj, mgr } = makeShipMgr('a', Faction.Gravitas);
        flush();
        const radar = mgr.state.radar;
        runTick(mgr);
        const healthyRange = obj.radarRange;
        expect(healthyRange).to.be.closeTo(radar.design.range * radar.effectiveness, 1);
        radar.malfunctionRangeFactor = 0.5;
        expect(radar.broken).to.equal(false); // guard: fluctuating, not broken
        runTick(mgr);
        expect(obj.radarRange).to.be.lessThan(healthyRange);
        expect(obj.radarRange).to.be.at.least(radar.design.malfunctionRange * radar.effectiveness - 1);
    });

    it('a fully malfunctioning radar is broken and its range drops to zero', () => {
        const { makeShipMgr, flush, runTick } = setup();
        const { obj, mgr } = makeShipMgr('a', Faction.Gravitas);
        flush();
        const radar = mgr.state.radar;
        radar.malfunctionRangeFactor = 1; // clamped by @range to the broken threshold
        expect(radar.broken).to.equal(true);
        expect(radar.effectiveness).to.equal(0);
        runTick(mgr);
        expect(obj.radarRange).to.equal(0);
    });

    it('setSmartPilotManeuveringMode rejects TARGET when there is no weapons target', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        flush();
        mgr.setSmartPilotManeuveringMode(SmartPilotMode.TARGET);
        expect(mgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);
        mgr.setSmartPilotRotationMode(SmartPilotMode.TARGET);
        expect(mgr.state.smartPilot.rotationMode).to.equal(SmartPilotMode.DIRECT);
    });

    it('changing smartPilot mode resets maneuvering input, same-mode set preserves it', () => {
        const { makeShipMgr, flush } = setup();
        const { mgr } = makeShipMgr('a', Faction.Gravitas);
        flush();
        mgr.state.smartPilot.maneuvering.x = 0.5;
        mgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT); // same mode — no reset
        expect(mgr.state.smartPilot.maneuvering.x).to.be.closeTo(0.5, 0.01);
        mgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY); // mode change — reset
        expect(mgr.state.smartPilot.maneuvering.x).to.equal(0);
    });
});
