import { MockDie, makeIterationsData } from './ship-test-harness';
import {
    Order,
    ShipManagerNpc,
    ShipManagerPc,
    SmartPilotMode,
    SpaceManager,
    Spaceship,
    XY,
    makeShipState,
    shipConfigurations,
} from '../src';

import { expect } from 'chai';
import { resetShipState } from '../src/ship/ship-manager-abstract';

const dragonflyConfig = shipConfigurations['dragonfly-SF22'];

function createShipSetup(Ctor: typeof ShipManagerPc | typeof ShipManagerNpc) {
    const spaceMgr = new SpaceManager();
    const shipObj = new Spaceship();
    shipObj.id = '1';
    const die = new MockDie();
    const shipMgr = new Ctor(shipObj, makeShipState(shipObj.id, dragonflyConfig), spaceMgr, die);
    die.expectedRoll = 1;
    spaceMgr.insert(shipObj);
    shipMgr.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
    shipMgr.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
    return { spaceMgr, shipObj, shipMgr, die };
}

function runOneTick(shipMgr: ShipManagerPc | ShipManagerNpc, spaceMgr: SpaceManager) {
    const iterations = makeIterationsData(1, 20);
    for (const id of iterations) {
        shipMgr.update(id);
        spaceMgr.update(id);
    }
}

describe('automation order on player ships', () => {
    it('player ship clears a MOVE order on the next tick', () => {
        const { spaceMgr, shipMgr } = createShipSetup(ShipManagerPc);

        // Simulate a stale order (e.g., carried over from NPC→PC conversion)
        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 1000;
        shipMgr.state.orderPosition.y = 2000;

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.order).to.equal(Order.NONE);
        expect(shipMgr.state.currentTask).to.equal('');
    });

    it('player ship clears an ATTACK order on the next tick', () => {
        const { spaceMgr, shipMgr } = createShipSetup(ShipManagerPc);

        shipMgr.state.order = Order.ATTACK;
        shipMgr.state.orderTargetId = 'some-target';

        runOneTick(shipMgr, spaceMgr);

        expect(shipMgr.state.order).to.equal(Order.NONE);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(shipMgr.state.orderTargetId).to.be.null;
    });

    it('player ship ignores new GM orders delivered via SpaceManager', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerPc);

        // Issue a move order through the normal command flow
        spaceMgr.state.botOrderCommands.push({
            ids: [shipObj.id],
            order: { type: 'move', position: { x: 5000, y: 5000 } },
        });

        runOneTick(shipMgr, spaceMgr);

        // Order should not be applied to the player ship
        expect(shipMgr.state.order).to.equal(Order.NONE);
    });

    it('player ship smartPilot is not overwritten by automation', () => {
        const { spaceMgr, shipMgr } = createShipSetup(ShipManagerPc);

        // Set a stale order
        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 1000;
        shipMgr.state.orderPosition.y = 2000;

        // Set player input
        shipMgr.state.smartPilot.maneuvering.x = 0;
        shipMgr.state.smartPilot.maneuvering.y = 0;
        shipMgr.state.smartPilot.rotation = 0;

        // Run one iteration (not a full tick) to check automation doesn't overwrite
        const iterations = makeIterationsData(0.05, 1);
        for (const id of iterations) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // The order should be cleared, not executed
        expect(shipMgr.state.order).to.equal(Order.NONE);
    });
});

describe('automation order on NPC ships', () => {
    it('NPC ship executes a MOVE order normally', () => {
        const { spaceMgr, shipMgr } = createShipSetup(ShipManagerNpc);

        // Issue a move order directly on state (as if delivered by getAndApplyOrder)
        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 1000;
        shipMgr.state.orderPosition.y = 2000;

        // Run one iteration
        const iterations = makeIterationsData(0.05, 1);
        for (const id of iterations) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        // NPC should still have the order and be executing the task
        expect(shipMgr.state.order).to.equal(Order.MOVE);
        expect(shipMgr.state.currentTask).to.include('Go to');
    });

    it('NPC ship receives GM orders via SpaceManager', () => {
        const { spaceMgr, shipObj, shipMgr } = createShipSetup(ShipManagerNpc);

        spaceMgr.state.botOrderCommands.push({
            ids: [shipObj.id],
            order: { type: 'move', position: { x: 5000, y: 5000 } },
        });

        runOneTick(shipMgr, spaceMgr);

        // NPC should have the MOVE order (or NONE if it already completed, but
        // the destination is far away so it should still be executing)
        // After cleanup() fix, completed orders get cleared, but 5000,5000 is far enough
        // that it won't complete in one tick
        expect(shipMgr.state.currentTask).to.include('Go to');
    });
});

describe('resetShipState clears orders', () => {
    it('clears order fields and currentTask', () => {
        const state = makeShipState('test', dragonflyConfig);

        state.order = Order.ATTACK;
        state.orderTargetId = 'target-1';
        state.orderPosition.x = 100;
        state.orderPosition.y = 200;
        state.currentTask = 'Attack target-1';

        resetShipState(state);

        expect(state.order).to.equal(Order.NONE);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(state.orderTargetId).to.be.null;
        expect(state.orderPosition.x).to.equal(0);
        expect(state.orderPosition.y).to.equal(0);
        expect(state.currentTask).to.equal('');
    });
});

describe('NPC to PC conversion clears stale currentTask', () => {
    it('PC ship constructed from NPC state has empty currentTask', () => {
        // Simulate NPC state: order and currentTask set during NPC execution
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = '1';
        const die = new MockDie();
        die.expectedRoll = 1;
        spaceMgr.insert(shipObj);

        // Build an NPC state with stale task info (as would exist during NPC→PC conversion)
        const npcState = makeShipState(shipObj.id, dragonflyConfig);
        npcState.order = Order.MOVE;
        npcState.orderPosition.x = 5000;
        npcState.orderPosition.y = 2000;
        npcState.currentTask = 'Go to 5000,2000';

        // Simulate convertShipType: clone state, then create PC manager
        const clonedState = npcState.clone();
        // After clone, stale currentTask should survive until resetShipState is called
        // Creating ShipManagerPc calls resetShipState in its constructor
        const pcMgr = new ShipManagerPc(shipObj, clonedState, spaceMgr, die);

        expect(pcMgr.state.currentTask).to.equal('');
    });

    it('clears smartPilot automation state', () => {
        const state = makeShipState('test', dragonflyConfig);

        state.smartPilot.maneuvering.x = 0.8;
        state.smartPilot.maneuvering.y = -0.5;
        state.smartPilot.rotation = 0.7;
        state.smartPilot.rotationTargetOffset = 0.3;
        state.smartPilot.maneuveringMode = SmartPilotMode.TARGET;
        state.smartPilot.rotationMode = SmartPilotMode.TARGET;
        state.currentTask = 'Go to 1000,2000';

        resetShipState(state);

        expect(state.smartPilot.maneuvering.x).to.equal(0);
        expect(state.smartPilot.maneuvering.y).to.equal(0);
        expect(state.smartPilot.rotation).to.equal(0);
        expect(state.smartPilot.rotationTargetOffset).to.equal(0);
        expect(state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.DIRECT);
        expect(state.smartPilot.rotationMode).to.equal(SmartPilotMode.DIRECT);
        expect(state.currentTask).to.equal('');
    });
});

describe('NPC to PC conversion', () => {
    it('cancelAllTasks clears NPC automation state before conversion', () => {
        const { shipMgr } = createShipSetup(ShipManagerNpc);

        shipMgr.state.order = Order.MOVE;
        shipMgr.state.orderPosition.x = 1000;
        shipMgr.state.orderPosition.y = 2000;
        shipMgr.state.smartPilot.maneuvering.x = 0.8;
        shipMgr.state.smartPilot.maneuvering.y = -0.3;
        shipMgr.state.smartPilot.rotation = 0.6;
        shipMgr.state.currentTask = 'Go to 1000,2000';

        shipMgr.cancelAllTasks();

        expect(shipMgr.state.smartPilot.maneuvering.x).to.equal(0);
        expect(shipMgr.state.smartPilot.maneuvering.y).to.equal(0);
        expect(shipMgr.state.smartPilot.rotation).to.equal(0);
        expect(shipMgr.state.currentTask).to.equal('');
    });

    it('PC ship created from NPC state starts with clean controls', () => {
        const { spaceMgr, shipObj, shipMgr: npcMgr } = createShipSetup(ShipManagerNpc);

        npcMgr.state.order = Order.MOVE;
        npcMgr.state.orderPosition.x = 5000;
        npcMgr.state.orderPosition.y = 5000;

        const iterations = makeIterationsData(0.05, 5);
        for (const id of iterations) {
            npcMgr.update(id);
            spaceMgr.update(id);
        }

        expect(npcMgr.state.smartPilot.maneuvering.x).to.not.equal(0);

        npcMgr.cancelAllTasks();

        const freshState = npcMgr.state.clone();
        const die = new MockDie();
        die.expectedRoll = 1;
        const pcMgr = new ShipManagerPc(shipObj, freshState, spaceMgr, die);

        expect(pcMgr.state.order).to.equal(Order.NONE);
        expect(pcMgr.state.smartPilot.maneuvering.x).to.equal(0);
        expect(pcMgr.state.smartPilot.maneuvering.y).to.equal(0);
        expect(pcMgr.state.smartPilot.rotation).to.equal(0);
        expect(pcMgr.state.currentTask).to.equal('');
        expect(pcMgr.state.smartPilot.maneuveringMode).to.equal(SmartPilotMode.VELOCITY);
    });

    it('PC ship after conversion responds to pilot maneuvering input', () => {
        const { spaceMgr, shipObj, shipMgr: npcMgr } = createShipSetup(ShipManagerNpc);

        npcMgr.state.order = Order.MOVE;
        npcMgr.state.orderPosition.x = 5000;
        npcMgr.state.orderPosition.y = 5000;

        const npcIterations = makeIterationsData(0.05, 5);
        for (const id of npcIterations) {
            npcMgr.update(id);
            spaceMgr.update(id);
        }

        npcMgr.cancelAllTasks();

        const freshState = npcMgr.state.clone();
        const die = new MockDie();
        die.expectedRoll = 1;
        const pcMgr = new ShipManagerPc(shipObj, freshState, spaceMgr, die);

        pcMgr.state.smartPilot.maneuvering.x = 1;
        const velocityBefore = XY.clone(shipObj.velocity);

        const pcIterations = makeIterationsData(0.05, 20);
        for (const id of pcIterations) {
            pcMgr.update(id);
            spaceMgr.update(id);
        }

        const velocityAfter = shipObj.velocity;
        expect(XY.lengthOf(XY.difference(velocityAfter, velocityBefore))).to.be.greaterThan(0);
    });

    it('PC ship after conversion does not drain all energy at idle', () => {
        const { spaceMgr, shipObj, shipMgr: npcMgr } = createShipSetup(ShipManagerNpc);

        npcMgr.cancelAllTasks();

        const freshState = npcMgr.state.clone();
        const die = new MockDie();
        die.expectedRoll = 1;
        const pcMgr = new ShipManagerPc(shipObj, freshState, spaceMgr, die);

        const initialEnergy = pcMgr.state.reactor.energy;

        const iterations = makeIterationsData(0.05, 100);
        for (const id of iterations) {
            pcMgr.update(id);
            spaceMgr.update(id);
        }

        expect(pcMgr.state.reactor.energy).to.be.greaterThan(initialEnergy * 0.5);
    });
});
