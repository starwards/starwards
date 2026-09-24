import {
    Asteroid,
    Explosion,
    Faction,
    IdleStrategy,
    Projectile,
    ShipDie,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    ammoDesigns,
    makeShipState,
    shipConfigurations,
} from '../src';

import { expect } from 'chai';
import { makeIterationsData } from './ship-test-harness';
import { tick } from './tick';

/** A small-station squarely between the launch point and the target. */
const STATION_POSITION = { x: 3000, y: 0 };

function station(spaceMgr: SpaceManager) {
    const obj = new Spaceship().init('station', Vec2.make(STATION_POSITION), 'small-station', Faction.Gravitas);
    const state = makeShipState(obj.id, shipConfigurations['small-station']);
    state.isPlayerShip = false;
    state.idleStrategy = IdleStrategy.PLAY_DEAD;
    const mgr = new ShipManagerNpc(obj, state, spaceMgr, new ShipDie(7));
    spaceMgr.insert(obj);
    return { obj, mgr };
}

describe('local obstacle avoidance', () => {
    it('a homing missile fired past a station reaches its target instead of the station', () => {
        const spaceMgr = new SpaceManager();
        station(spaceMgr);
        const target = new Asteroid();
        target.radius = 50;
        target.init('target', Vec2.make({ x: 6000, y: 0 }));
        const missile = new Projectile('HiExpMissile');
        missile.init('missile', Vec2.make({ x: 0, y: 0 }));
        missile.targetId = target.id;
        missile.shipId = 'shooter';
        missile.secondsToLive = ammoDesigns.HiExpMissile.homing.secondsToLive;
        missile.velocity = Vec2.make({ x: 100, y: 0 });
        spaceMgr.insertBulk([target, missile]);
        spaceMgr.forceFlushEntities();

        let detonation: XY | null = null;
        for (let seconds = 0; seconds < 30 && !detonation; seconds += 1 / 20) {
            tick(spaceMgr, 1 / 20);
            for (const object of spaceMgr.state) {
                if (Explosion.isInstance(object) && object.shipId === 'shooter') {
                    detonation = XY.clone(object.position);
                }
            }
        }
        expect(detonation, 'the missile detonated').to.not.equal(null);
        expect(XY.distance(detonation!, target.position)).to.be.lessThan(200);
    });

    it('an MK1 attacking past a station closes on its target without touching the station', () => {
        const spaceMgr = new SpaceManager();
        const { obj: stationObj, mgr: stationMgr } = station(spaceMgr);

        const targetObj = new Spaceship().init('target', Vec2.make({ x: 8000, y: 0 }), 'gravitas', Faction.Gravitas);
        const targetState = makeShipState(targetObj.id, shipConfigurations.gravitas);
        targetState.isPlayerShip = false;
        targetState.idleStrategy = IdleStrategy.PLAY_DEAD;
        const targetMgr = new ShipManagerNpc(targetObj, targetState, spaceMgr, new ShipDie(8));

        const raiderObj = new Spaceship().init('raider', Vec2.make(XY.zero), 'dragonfly-MK1', Faction.Raiders);
        const raiderState = makeShipState(raiderObj.id, shipConfigurations['dragonfly-MK1']);
        raiderState.isPlayerShip = false;
        const raiderMgr = new ShipManagerNpc(raiderObj, raiderState, spaceMgr, new ShipDie(9));

        spaceMgr.insertBulk([targetObj, raiderObj]);
        spaceMgr.forceFlushEntities();
        spaceMgr.state.botOrderCommands.push({ ids: ['raider'], order: { type: 'attack', targetId: 'target' } });

        let closestSurfaceGap = Infinity;
        let closestToTarget = Infinity;
        for (const id of makeIterationsData(40, 40 * 20)) {
            raiderMgr.update(id);
            targetMgr.update(id);
            stationMgr.update(id);
            spaceMgr.update(id);
            const gap = XY.distance(raiderObj.position, stationObj.position) - stationObj.radius - raiderObj.radius;
            closestSurfaceGap = Math.min(closestSurfaceGap, gap);
            closestToTarget = Math.min(closestToTarget, XY.distance(raiderObj.position, targetObj.position));
        }
        expect(closestSurfaceGap, 'never touched the station').to.be.greaterThan(0);
        expect(closestToTarget, 'reached its gun envelope').to.be.lessThan(
            shipConfigurations['dragonfly-MK1'].chainGuns[0][1].maxShellRange,
        );
    });
    it('an MK1 moving to a point beside a station arrives instead of circling it', () => {
        const spaceMgr = new SpaceManager();
        const { obj: stationObj, mgr: stationMgr } = station(spaceMgr);
        const raiderObj = new Spaceship().init('raider', Vec2.make(XY.zero), 'dragonfly-MK1', Faction.Raiders);
        const raiderState = makeShipState(raiderObj.id, shipConfigurations['dragonfly-MK1']);
        raiderState.isPlayerShip = false;
        const raiderMgr = new ShipManagerNpc(raiderObj, raiderState, spaceMgr, new ShipDie(9));
        spaceMgr.insert(raiderObj);
        spaceMgr.forceFlushEntities();
        // the far side of the station, inside the clearance avoidance keeps around its hull
        const destination = { x: STATION_POSITION.x + stationObj.radius + 50, y: 0 };
        spaceMgr.state.botOrderCommands.push({ ids: ['raider'], order: { type: 'move', position: destination } });

        let closestSurfaceGap = Infinity;
        let closestToDestination = Infinity;
        for (const id of makeIterationsData(120, 120 * 20)) {
            raiderMgr.update(id);
            stationMgr.update(id);
            spaceMgr.update(id);
            const gap = XY.distance(raiderObj.position, stationObj.position) - stationObj.radius - raiderObj.radius;
            closestSurfaceGap = Math.min(closestSurfaceGap, gap);
            closestToDestination = Math.min(closestToDestination, XY.distance(raiderObj.position, destination));
        }
        expect(closestSurfaceGap, 'never touched the station').to.be.greaterThan(0);
        expect(closestToDestination, 'reached its destination').to.be.lessThan(raiderObj.radius);
    });
});
