import {
    Asteroid,
    Faction,
    Projectile,
    ScanLevel,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    makeShipState,
    shipConfigurations,
} from '../src';

import { MockDie } from './ship-test-harness';
import { ShipManager } from '../src/ship/ship-manager-abstract';
import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

// the scan beam rests dead ahead (bearing 0), so a missile on the +x axis sits in it
function shipWithMissileInBeam(scanLevel: ScanLevel = ScanLevel.FULL) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = 'ship1';
    shipObj.faction = Faction.Gravitas;
    const ships = new Map<string, ShipManager>();
    const shipMgr = new ShipManagerPc(
        shipObj,
        makeShipState(shipObj.id, demoShipConfig),
        spaceMgr,
        new MockDie(),
        ships,
    );
    ships.set(shipObj.id, shipMgr);
    spaceMgr.insert(shipObj);
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

    const missile = new Projectile('FragMissile').init('missile1', Vec2.make({ x: 3000, y: 0 }));
    missile.secondsToLive = 100;
    missile.shipId = 'raider1';
    missile.targetId = 'ship1';
    missile.freeze = true; // hold it in the beam: these tests are about the beam, not the flight
    spaceMgr.insert(missile);
    spaceMgr.forceFlushEntities();
    if (scanLevel !== ScanLevel.UFO) {
        spaceMgr.factionIntel.setScanLevel(missile.id, shipObj.faction, scanLevel);
    }
    const beam = shipMgr.state.radars.find((r) => r.design.isScanBeam);
    if (!beam) {
        throw new Error('demo ship has no scan beam');
    }
    let totalSeconds = 0;
    const run = (seconds: number) => {
        const dt = 0.05;
        for (let i = 0; i < Math.round(seconds / dt); i++) {
            totalSeconds += dt;
            const id = { deltaSeconds: dt, deltaSecondsAvg: dt, totalSeconds };
            shipMgr.update(id);
            spaceMgr.update(id);
        }
    };
    run(0.05);
    return { spaceMgr, shipMgr, missile, beam, run };
}

describe('beam jamming (M4.27 ruling)', () => {
    it('jams a FULL-scanned missile after 1 s of held jam: it drops its target, keeps faction and owner', () => {
        const { missile, beam, run } = shipWithMissileInBeam();
        const factionBefore = missile.faction;
        beam.jamming = true;
        run(0.9);
        expect(missile.jammed).to.equal(false);
        run(0.2);
        expect(missile.jammed).to.equal(true);
        expect(missile.targetId).to.equal(null);
        expect(missile.faction).to.equal(factionBefore);
        expect(missile.shipId).to.equal('raider1');
    });

    it('does not jam while the key is not held', () => {
        const { missile, run } = shipWithMissileInBeam();
        run(2);
        expect(missile.jammed).to.equal(false);
    });

    it('does not jam a missile scanned only to BASIC', () => {
        const { missile, beam, run } = shipWithMissileInBeam(ScanLevel.BASIC);
        beam.jamming = true;
        run(2);
        expect(missile.jammed).to.equal(false);
    });

    it('needs continuous dwell: releasing the key resets it', () => {
        const { missile, beam, run } = shipWithMissileInBeam();
        beam.jamming = true;
        run(0.7);
        beam.jamming = false;
        run(0.1);
        beam.jamming = true;
        run(0.7);
        expect(missile.jammed).to.equal(false);
    });

    it('does not jam a missile outside the beam', () => {
        const { missile, beam, run } = shipWithMissileInBeam();
        beam.bearingCommand = 90;
        run(5);
        beam.jamming = true;
        run(2);
        expect(missile.jammed).to.equal(false);
    });

    it('costs heavy beam heat while held', () => {
        const { beam, run } = shipWithMissileInBeam();
        const before = beam.heat;
        beam.jamming = true;
        run(2);
        expect(beam.heat - before).to.be.greaterThan(beam.design.jamHeatPerSecond * 2 * 0.75);
    });
});

describe('jammed missile re-lock (M4.27 ruling)', () => {
    function jammedMissileAmong(objects: { id: string; x: number; kind: 'ship' | 'asteroid' }[]) {
        const spaceMgr = new SpaceManager();
        for (const { id, x, kind } of objects) {
            if (kind === 'ship') {
                const ship = new Spaceship();
                ship.id = id;
                ship.radius = 10;
                ship.faction = Faction.Raiders;
                ship.position = Vec2.make({ x, y: 0 });
                spaceMgr.insert(ship);
            } else {
                spaceMgr.insert(new Asteroid().init(id, Vec2.make({ x, y: 0 }), 10));
            }
        }
        const missile = new Projectile('ArmPenMissile').init('missile1', Vec2.make({ x: 0, y: 0 }));
        missile.secondsToLive = 100;
        missile.shipId = 'owner';
        spaceMgr.insert(missile);
        spaceMgr.forceFlushEntities();
        spaceMgr.jamMissile(missile);
        return { spaceMgr, missile };
    }
    const tick = (spaceMgr: SpaceManager) =>
        spaceMgr.update({ deltaSeconds: 0.05, deltaSecondsAvg: 0.05, totalSeconds: 0.05 });

    it('locks onto the nearest solid object within 1 km, friend or foe, and accelerates at it', () => {
        const { spaceMgr, missile } = jammedMissileAmong([
            { id: 'friend', x: 800, kind: 'ship' },
            { id: 'rock', x: -1500, kind: 'asteroid' },
        ]);
        tick(spaceMgr);
        expect(missile.targetId).to.equal('friend');
        for (let i = 0; i < 20; i++) {
            tick(spaceMgr);
        }
        expect(missile.velocity.x).to.be.greaterThan(0);
    });

    it('keeps flying untargeted while nothing is within 1 km', () => {
        const { spaceMgr, missile } = jammedMissileAmong([{ id: 'rock', x: 1500, kind: 'asteroid' }]);
        tick(spaceMgr);
        expect(missile.targetId).to.equal(null);
        expect(missile.destroyed).to.equal(false);
    });

    it('never locks onto its own launcher', () => {
        const { spaceMgr, missile } = jammedMissileAmong([
            { id: 'owner', x: 300, kind: 'ship' },
            { id: 'rock', x: 900, kind: 'asteroid' },
        ]);
        tick(spaceMgr);
        expect(missile.targetId).to.equal('rock');
    });
});
