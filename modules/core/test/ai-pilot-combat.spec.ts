import {
    Faction,
    Order,
    ShipManagerNpc,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
    toDegreesDelta,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { MAX_SYSTEM_HEAT } from '../src/ship/heat-manager';
import { ShipDesign } from '../src/ship/make-ship-state';
import { demoShipChaingun } from '../src/configurations/demo-ship';
import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

// A turreted mount, unlike the roster's bolted-forward chain gun, can actually swing.
const turretedChaingun = { ...demoShipChaingun, turnSpeed: 90, bearingLimit: 180 };

describe('AI pilot combat credibility (issue #2146)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('never overheats its own chain gun into damage during a sustained attack', () => {
        const spaceMgr = new SpaceManager();
        const die = new MockDie();
        die.expectedRoll = 1;

        const attacker = new Spaceship().init(
            'attacker',
            Vec2.make(XY.byLengthAndDirection(3000, 0)),
            'dragonfly-MK1',
            Faction.Raiders,
        );
        const attackerState = makeShipState(attacker.id, shipConfigurations['dragonfly-MK1']);
        attackerState.isPlayerShip = false;
        const attackerMgr = new ShipManagerNpc(attacker, attackerState, spaceMgr, die);

        const target = new Spaceship().init('target', Vec2.make(XY.zero), 'large-station', Faction.Gravitas);
        const targetState = makeShipState(target.id, shipConfigurations['large-station']);
        const targetMgr = new ShipManagerNpc(target, targetState, spaceMgr, die);

        spaceMgr.insert(attacker);
        spaceMgr.insert(target);
        spaceMgr.forceFlushEntities();

        attackerMgr.state.order = Order.ATTACK;
        attackerMgr.state.orderTargetId = target.id;

        const gun = attackerMgr.state.chainGuns[0];
        let maxHeat = 0;
        for (const id of makeIterationsData(300, 6000)) {
            attackerMgr.update(id);
            targetMgr.update(id);
            spaceMgr.update(id);
            maxHeat = Math.max(maxHeat, gun.heat);
        }

        // heat never even reaches the overheat ceiling, so the self-inflicted damage path in
        // HeatManager.addHeat never fires and the mount is never bent off-true by its own gunnery.
        expect(maxHeat).to.be.lessThan(MAX_SYSTEM_HEAT);
        expect(gun.bearingSkew).to.equal(0);
    });

    it('compensates aim for damage-induced bearing skew so shots track the real target line', () => {
        const design: ShipDesign = {
            ...demoShipConfig,
            chainGuns: [['FWD', turretedChaingun]],
        };
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'attacker';
        shipObj.faction = Faction.Raiders;
        const targetObj = new Spaceship();
        targetObj.id = 'target';
        targetObj.faction = Faction.Gravitas;
        targetObj.position.x = 3000;
        targetObj.position.y = 0;
        const die = new MockDie();
        die.expectedRoll = 1;
        const shipMgr = new ShipManagerNpc(shipObj, makeShipState(shipObj.id, design), spaceMgr, die);
        spaceMgr.insert(shipObj);
        spaceMgr.insert(targetObj);
        spaceMgr.forceFlushEntities();

        const [mount] = shipMgr.state.chainGuns;
        // simulate prior damage: the mount is bent 20 degrees off whatever it's commanded to
        mount.bearingSkew = 20;

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = targetObj.id;

        // Just long enough for the turret to finish swinging (45 deg/s at NORMAL power, a 20-degree
        // correction) -- short on purpose so the combat weave overlay (a separate feature under test
        // elsewhere) hasn't had time to drift the hull and confound this measurement.
        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        const lineOfSightBearing = XY.angleOf(XY.difference(targetObj.position, shipObj.position));
        // despite the 20-degree skew, the mount's real (global) bearing still lands on the target
        expect(toDegreesDelta(mount.getGlobalBearing(shipMgr.state) - lineOfSightBearing)).to.be.closeTo(0, 2);
    });

    it('weaves laterally while holding an attack position, without losing the target off its firing arc', () => {
        const design: ShipDesign = {
            ...demoShipConfig,
            chainGuns: [['FWD', turretedChaingun]],
        };
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'attacker';
        shipObj.faction = Faction.Raiders;
        const targetObj = new Spaceship();
        targetObj.id = 'target';
        targetObj.faction = Faction.Gravitas;
        // within the mount's [minShellRange, maxShellRange] band, so the AI holds station here
        // (matchGlobalSpeed) instead of closing distance (moveToTarget) -- a stationary target and
        // a stationary attacker would otherwise command zero strafe every single tick.
        targetObj.position.x = 3000;
        targetObj.position.y = 0;
        const die = new MockDie();
        die.expectedRoll = 1;
        const shipMgr = new ShipManagerNpc(shipObj, makeShipState(shipObj.id, design), spaceMgr, die);
        spaceMgr.insert(shipObj);
        spaceMgr.insert(targetObj);
        spaceMgr.forceFlushEntities();

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = targetObj.id;

        const mount = shipMgr.state.chainGuns[0];
        const strafeSamples: number[] = [];
        const aimErrorSamples: number[] = [];
        // A short, early window only: a stationary attacker holding on a stationary in-range target
        // commands exactly zero strafe every tick under plain station-keeping (matchGlobalSpeed) --
        // confirmed empirically for this scenario's first ~4.5 sim-seconds, well short of the
        // pass-by dynamics that eventually kick in further into a real engagement.
        for (const id of makeIterationsData(4.5, 90)) {
            shipMgr.update(id);
            spaceMgr.update(id);
            strafeSamples.push(shipMgr.state.smartPilot.maneuvering.y);
            const lineOfSightBearing = XY.angleOf(XY.difference(targetObj.position, shipObj.position));
            aimErrorSamples.push(Math.abs(toDegreesDelta(mount.getGlobalBearing(shipMgr.state) - lineOfSightBearing)));
        }

        // some samples must differ meaningfully from that zero baseline for a weave to exist at all.
        expect(Math.max(...strafeSamples.map(Math.abs))).to.be.greaterThan(0.05);
        // ...and the weave must stay "minimal": the mount keeps tracking the target, not swinging wild.
        expect(Math.max(...aimErrorSamples)).to.be.lessThan(15);
    });
});
