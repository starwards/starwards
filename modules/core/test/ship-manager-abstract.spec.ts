import { MockDie, makeIterationsData } from './ship-test-harness';
import {
    PowerLevel,
    ShipManagerNpc,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    makeShipState,
    shipConfigurations,
} from '../src';

import { expect } from 'chai';
import { resetShipState } from '../src/ship/ship-manager-abstract';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

describe.each([ShipManagerPc, ShipManagerNpc])('%p', (shipManagerCtor) => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    function createShipSetup() {
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = '1';
        const die = new MockDie();
        const shipMgr = new shipManagerCtor(shipObj, makeShipState(shipObj.id, dragonflyConfig), spaceMgr, die);
        die.expectedRoll = 1;
        spaceMgr.insert(shipObj);
        shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
        shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        return { spaceMgr, shipObj, shipMgr, die };
    }

    function runOneTick(shipMgr: InstanceType<typeof shipManagerCtor>, spaceMgr: SpaceManager) {
        const iterations = makeIterationsData(1, 20);
        for (const id of iterations) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }
    }

    it('syncShipProperties overwrites direct state writes', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup();

        // Direct write to ship state spaceship position - this should be overwritten
        shipMgr.state.spaceship.position.x = 999;

        // The space object position remains at 0
        expect(shipObj.position.x).to.equal(0);

        // After a tick, syncShipProperties should overwrite state from spaceObject
        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.spaceship.position.x).to.equal(shipObj.position.x);
        expect(shipMgr.state.spaceship.position.x).to.not.equal(999);
    });

    it('syncShipProperties copies angle from spaceObject', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup();

        shipObj.angle = 45;

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.spaceship.angle).to.be.closeTo(45, 1);
    });

    it('syncShipProperties copies all synced properties', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup();

        shipObj.position.x = 100;
        shipObj.position.y = 200;
        shipObj.velocity.x = 10;
        shipObj.velocity.y = 20;
        shipObj.angle = 90;
        shipObj.faction = 2;

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.spaceship.position.x).to.be.closeTo(shipObj.position.x, 1);
        expect(shipMgr.state.spaceship.position.y).to.be.closeTo(shipObj.position.y, 1);
        expect(shipMgr.state.spaceship.velocity.x).to.be.closeTo(shipObj.velocity.x, 1);
        expect(shipMgr.state.spaceship.velocity.y).to.be.closeTo(shipObj.velocity.y, 1);
        expect(shipMgr.state.spaceship.angle).to.be.closeTo(shipObj.angle, 1);
        expect(shipMgr.state.spaceship.faction).to.equal(shipObj.faction);
    });

    it('resetShipState resets command fields', () => {
        const state = makeShipState('test', dragonflyConfig);

        state.afterBurnerCommand = 1;
        state.rotationModeCommand = true;
        state.maneuveringModeCommand = true;

        resetShipState(state);

        expect(state.afterBurnerCommand).to.equal(0);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(state.rotationModeCommand).to.be.false;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(state.maneuveringModeCommand).to.be.false;
    });

    it('resetShipState restores reactor energy to max', () => {
        const state = makeShipState('test', dragonflyConfig);

        state.reactor.energy = 0;

        resetShipState(state);

        expect(state.reactor.energy).to.equal(state.reactor.design.maxEnergy);
    });

    it('resetShipState restores afterburner fuel to max', () => {
        const state = makeShipState('test', dragonflyConfig);

        state.maneuvering.afterBurnerFuel = 0;

        resetShipState(state);

        expect(state.maneuvering.afterBurnerFuel).to.equal(state.maneuvering.design.maxAfterBurnerFuel);
    });

    it('resetShipState resets radar malfunctionRangeFactor', () => {
        const state = makeShipState('test', dragonflyConfig);

        state.radars[0].malfunctionRangeFactor = 0.5;

        resetShipState(state);

        expect(state.radars[0].malfunctionRangeFactor).to.equal(0);
    });

    it('resetShipState restores magazine count', () => {
        const state = makeShipState('test', dragonflyConfig);

        state.magazine.count_HiExpShell = 0;

        resetShipState(state);

        expect(state.magazine.count_HiExpShell).to.equal(state.magazine.max_HiExpShell);
    });

    it('resetShipState clears hull damage', () => {
        const state = makeShipState('test', dragonflyConfig);

        state.hullDamaged = true;

        resetShipState(state);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(state.hullDamaged).to.be.false;
    });

    it('ship systems carry the modelName configured in the ship design', () => {
        const state = makeShipState('test', dragonflyConfig);

        expect(state.design.modelName).to.equal(dragonflyConfig.properties.modelName);
        expect(state.radars[0].design.modelName).to.equal(dragonflyConfig.radars[0].modelName);
        expect(state.reactor.design.modelName).to.equal(dragonflyConfig.reactor.modelName);
        expect(state.smartPilot.design.modelName).to.equal(dragonflyConfig.smartPilot.modelName);
        expect(state.magazine.design.modelName).to.equal(dragonflyConfig.magazine.modelName);
        expect(state.weaponsTarget.design.modelName).to.equal(dragonflyConfig.weaponsTarget.modelName);
        if (state.warp) {
            expect(state.warp.design.modelName).to.equal(dragonflyConfig.warp?.modelName);
        }
        expect(state.docking.design.modelName).to.equal(dragonflyConfig.docking.modelName);
        expect(state.maneuvering.design.modelName).to.equal(dragonflyConfig.maneuvering.modelName);
        if (state.chainGun) {
            expect(state.chainGun.design.modelName).to.equal(dragonflyConfig.chainGun?.modelName);
        }
        for (const thruster of state.thrusters) {
            expect(thruster.design.modelName).to.equal(dragonflyConfig.thrusters[thruster.index][1].modelName);
        }
        for (const tube of state.tubes) {
            expect(tube.design.modelName).to.equal(dragonflyConfig.tubes[tube.index][1].modelName);
        }
    });

    // NPC ships bypass energy management (trySpendEnergy always returns true),
    // so reactor power tests only apply to player ships.
    if (shipManagerCtor === ShipManagerPc) {
        it('reactor power level affects energy generation', () => {
            const { spaceMgr, shipMgr } = createShipSetup();
            const state = shipMgr.state;
            const reactor = state.reactor;

            // shut down all other systems so they don't consume energy
            state.radars[0].power = PowerLevel.SHUTDOWN;
            if (state.warp) state.warp.power = PowerLevel.SHUTDOWN;
            state.maneuvering.power = PowerLevel.SHUTDOWN;
            if (state.chainGun) state.chainGun.power = PowerLevel.SHUTDOWN;
            for (const thruster of state.thrusters) thruster.power = PowerLevel.SHUTDOWN;
            for (const tube of state.tubes) tube.power = PowerLevel.SHUTDOWN;

            const energyPerSecond = reactor.energyPerSecond;

            reactor.energy = 0;
            reactor.power = PowerLevel.MAX;
            for (const id of makeIterationsData(1, 20)) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }
            const energyAtMax = reactor.energy;
            expect(energyAtMax).to.be.closeTo(energyPerSecond, 1);

            reactor.energy = 0;
            reactor.power = PowerLevel.LOW;
            for (const id of makeIterationsData(1, 20)) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }
            const energyAtLow = reactor.energy;
            expect(energyAtLow).to.be.closeTo(energyPerSecond * PowerLevel.LOW, 1);
        });

        it('reactor at SHUTDOWN power generates no energy', () => {
            const { spaceMgr, shipMgr } = createShipSetup();
            const state = shipMgr.state;

            // shut down all other systems so they don't consume energy
            state.radars[0].power = PowerLevel.SHUTDOWN;
            if (state.warp) state.warp.power = PowerLevel.SHUTDOWN;
            state.maneuvering.power = PowerLevel.SHUTDOWN;
            if (state.chainGun) state.chainGun.power = PowerLevel.SHUTDOWN;
            for (const thruster of state.thrusters) thruster.power = PowerLevel.SHUTDOWN;
            for (const tube of state.tubes) tube.power = PowerLevel.SHUTDOWN;

            state.reactor.energy = 0;
            state.reactor.power = PowerLevel.SHUTDOWN;

            for (const id of makeIterationsData(1, 20)) {
                shipMgr.update(id);
                spaceMgr.update(id);
            }
            expect(state.reactor.energy).to.equal(0);
        });
    }
});
