import {
    Asteroid,
    Nebula,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    Vec2,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

describe('MovementManager', () => {
    let spaceMgr: SpaceManager;
    let shipObj: Spaceship;
    let die: MockDie;
    let shipMgr: ShipManagerPc;

    beforeEach(() => {
        spaceMgr = new SpaceManager();
        shipObj = new Spaceship();
        shipObj.id = '1';
        die = new MockDie();
        shipMgr = new ShipManagerPc(shipObj, makeShipState(shipObj.id, demoShipConfig), spaceMgr, die);
        die.expectedRoll = 1;
        spaceMgr.insert(shipObj);
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('boost changes velocity in forward direction', () => {
        // In DIRECT mode, smartPilot.maneuvering.x is the boost input
        shipMgr.state.smartPilot.maneuvering.x = 1;

        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // Ship at angle 0 should accelerate in the +x direction
        expect(shipObj.velocity.x).to.be.greaterThan(0);
        expect(XY.lengthOf(shipObj.velocity)).to.be.greaterThan(0);
    });

    it('strafe changes velocity perpendicular to heading', () => {
        // In DIRECT mode, smartPilot.maneuvering.y is the strafe input
        shipMgr.state.smartPilot.maneuvering.y = 1;

        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // Ship at angle 0: strafe should push in the +y direction (perpendicular)
        expect(shipObj.velocity.y).to.not.equal(0);
        expect(XY.lengthOf(shipObj.velocity)).to.be.greaterThan(0);
    });

    it('marks a thruster energyStarved when it cannot draw the energy boost needs, so the reason is visible', () => {
        shipMgr.state.reactor.energy = 0;
        shipMgr.state.smartPilot.maneuvering.x = 1; // boost commanded

        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect(shipObj.velocity.x).to.equal(0); // thrust silently did nothing...
        expect(shipMgr.state.thrusters.some((t) => t.energyStarved)).to.equal(true); // ...but it's visible why
    });

    it('clears energyStarved once the thruster can draw energy again', () => {
        shipMgr.state.reactor.energy = 0;
        shipMgr.state.smartPilot.maneuvering.x = 1;
        const [tick] = makeIterationsData(1, 20);
        shipMgr.update(tick);
        expect(shipMgr.state.thrusters.some((t) => t.energyStarved)).to.equal(true);

        shipMgr.state.reactor.energy = shipMgr.state.reactor.design.maxEnergy;
        shipMgr.update(tick);

        expect(shipMgr.state.thrusters.every((t) => !t.energyStarved)).to.equal(true);
    });

    it('clears a stale maneuvering.energyStarved once nothing is trying to draw energy from it, without needing a new rotation command', () => {
        // simulate a stale flag left over from an earlier failed draw (rotation or afterburner
        // charge — both share this one system) — no rotation commanded and the afterburner tank
        // is already full, so neither draw runs this tick to naturally clear it
        shipMgr.state.maneuvering.energyStarved = true;
        shipMgr.state.smartPilot.rotation = 0;
        shipMgr.state.maneuvering.afterBurnerFuel = shipMgr.state.maneuvering.design.maxAfterBurnerFuel;

        const [tick] = makeIterationsData(1, 20);
        shipMgr.update(tick);

        expect(shipMgr.state.maneuvering.energyStarved).to.equal(false);
    });

    it('a ship built with warp: null does not throw during construction or a tick', () => {
        const warplessState = makeShipState('warpless', { ...demoShipConfig, warp: null });
        expect(warplessState.warp).to.equal(null);

        const warplessShipObj = new Spaceship();
        warplessShipObj.id = 'warpless';
        const warplessDie = new MockDie();
        const warplessSpaceMgr = new SpaceManager();
        const warplessShipMgr = new ShipManagerPc(warplessShipObj, warplessState, warplessSpaceMgr, warplessDie);
        warplessDie.expectedRoll = 1;
        warplessSpaceMgr.insert(warplessShipObj);
        warplessShipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        warplessShipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);

        expect(() => {
            for (const id of makeIterationsData(1, 20)) {
                warplessShipMgr.update(id);
                warplessSpaceMgr.update(id);
            }
        }).to.not.throw();
    });

    it('ship decelerates when braking', () => {
        // Give the ship some initial velocity by boosting first
        shipMgr.state.smartPilot.maneuvering.x = 1;
        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        const initialSpeed = XY.lengthOf(shipObj.velocity);
        expect(initialSpeed).to.be.greaterThan(0);

        // Switch to VELOCITY mode with zero target velocity to engage braking
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
        shipMgr.state.smartPilot.maneuvering.x = 0;
        shipMgr.state.smartPilot.maneuvering.y = 0;

        for (const id of makeIterationsData(3, 60)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        const finalSpeed = XY.lengthOf(shipObj.velocity);
        expect(finalSpeed).to.be.lessThan(initialSpeed);
    });

    it('afterburner consumes fuel', () => {
        // Enable afterburner and boost
        shipMgr.state.afterBurnerCommand = 1;
        shipMgr.state.smartPilot.maneuvering.x = 1;

        // Record initial fuel (set to max by resetShipState)
        const initialFuel = shipMgr.state.maneuvering.afterBurnerFuel;
        expect(initialFuel).to.be.greaterThan(0);

        // Disable afterburner recharging so net fuel only goes down
        shipMgr.state.maneuvering.design.afterBurnerCharge = 0;

        for (const id of makeIterationsData(2, 40)) {
            // Drain reactor energy each tick so recharging cannot occur
            shipMgr.state.reactor.energy = 0;
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        const finalFuel = shipMgr.state.maneuvering.afterBurnerFuel;
        expect(finalFuel).to.be.lessThan(initialFuel);
    });

    it('a solid object within warp proximity jams warp', () => {
        const rock = new Asteroid();
        rock.init('rock', Vec2.make({ x: 2000, y: 0 }), 100);
        spaceMgr.insert(rock);
        spaceMgr.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });

        shipMgr.state.warp!.desiredLevel = 1;
        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(shipMgr.state.warp!.jammed).to.equal(true);
    });

    it('an explicitly-set maneuvering/rotation mode stays set once the smart pilot has zero effectiveness (issue #2186)', () => {
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.VELOCITY);

        // No power to the smart pilot: effectiveness drops to 0, same as a GM-forced or hacked system
        shipMgr.state.smartPilot.power = 0;
        expect(shipMgr.state.smartPilot.effectiveness).to.equal(0);

        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect(shipMgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);
        expect(shipMgr.state.smartPilot.rotationMode).to.equal(SmartPilotMode.VELOCITY);
    });

    it('steering does nothing in VELOCITY mode while the smart pilot has zero effectiveness (issue #2186 follow-up)', () => {
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.VELOCITY);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.VELOCITY);
        shipMgr.state.smartPilot.power = 0;
        expect(shipMgr.state.smartPilot.effectiveness).to.equal(0);

        shipMgr.state.smartPilot.maneuvering.x = 1;
        shipMgr.state.smartPilot.rotation = 1;

        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect(XY.isZero(shipObj.velocity, 0.01)).to.equal(true);
        expect(shipObj.turnSpeed).to.equal(0);
    });

    it('steering still works in DIRECT mode even while the smart pilot has zero effectiveness (issue #2186 follow-up)', () => {
        shipMgr.state.smartPilot.power = 0;
        expect(shipMgr.state.smartPilot.effectiveness).to.equal(0);

        shipMgr.state.smartPilot.maneuvering.x = 1;

        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        expect(shipObj.velocity.x).to.be.greaterThan(0);
    });

    it('a nebula within warp proximity does not jam warp — it is optical only (issue #2123)', () => {
        const fog = new Nebula();
        fog.init('fog', Vec2.make({ x: 2000, y: 0 }), 500);
        spaceMgr.insert(fog);
        spaceMgr.update({ deltaSeconds: 0, deltaSecondsAvg: 0, totalSeconds: 0 });

        shipMgr.state.warp!.desiredLevel = 1;
        for (const id of makeIterationsData(1, 20)) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
        expect(shipMgr.state.warp!.jammed).to.equal(false);
    });
});
