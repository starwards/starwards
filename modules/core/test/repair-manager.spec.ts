import { MockDie, makeIterationsData } from './ship-test-harness';
import { cancelRepair, enqueueRepair, reorderRepair } from '../src/ship/repair-commands';
import { demoShip, makeShipState } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { DockingMode } from '../src/ship/docking';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { PowerLevel } from '../src/ship/system';
import { RepairManager } from '../src/ship/repair-manager';
import { RepairOperationStatus } from '../src/ship/repair-queue';
import { RepairProtocolStats } from '../src/configurations/repair-protocols';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { expect } from 'chai';
import { resetShipState } from '../src/ship/ship-manager-abstract';
import { tick } from './tick';

const testCatalog: Record<string, RepairProtocolStats> = {
    fixThrusters: {
        name: 'Fix thruster offset',
        targets: [{ system: 'thrusters', field: 'bearingSkew' }],
        duration: 2,
        energyDraw: 10,
        heat: 0,
        sideEffectSystems: ['thrusters'],
        tier: 'field',
    },
    fixMagazine: {
        name: 'Fix magazine capacity',
        targets: [{ system: 'magazine', field: 'capacity' }],
        duration: 2,
        energyDraw: 10,
        heat: 0,
        sideEffectSystems: [],
        tier: 'field',
    },
    heatDocking: {
        name: 'Heat-generating docking fix',
        targets: [{ system: 'docking', field: 'rangesFactor' }],
        duration: 5,
        energyDraw: 1,
        heat: 100,
        sideEffectSystems: [],
        tier: 'field',
    },
    heatThrusters: {
        name: 'Heat-generating thruster fix',
        targets: [{ system: 'thrusters', field: 'bearingSkew' }],
        duration: 4,
        energyDraw: 1,
        heat: 24,
        sideEffectSystems: [],
        tier: 'field',
    },
    dockedOnly: {
        name: 'Docked-tier only',
        targets: [{ system: 'reactor', field: 'effeciencyFactor' }],
        duration: 1,
        energyDraw: 1,
        heat: 0,
        sideEffectSystems: [],
        tier: 'docked',
    },
};

function setUpShip(catalog: Record<string, RepairProtocolStats> = testCatalog) {
    const shipId = 'test-ship';
    const state = makeShipState(shipId, demoShip);
    state.reactor.energy = state.reactor.design.maxEnergy;
    const spaceObject = new Spaceship();
    spaceObject.id = shipId;
    const spaceManager = new SpaceManager();
    spaceManager.insert(spaceObject);
    const die = new MockDie();
    const damageManager = new DamageManager(spaceObject, state, spaceManager, die);
    const heatManager = new HeatManager(state, damageManager);
    const energyManager = new EnergyManager(state, heatManager);
    const repairManager = new RepairManager(state, energyManager, heatManager, catalog);
    return { state, repairManager, energyManager, heatManager };
}

type TestShipState = ReturnType<typeof setUpShip>['state'];

function enqueue(state: TestShipState, protocolId: string) {
    enqueueRepair.setValue(state, { protocolId });
}

function cancel(state: TestShipState, operationId: string) {
    cancelRepair.setValue(state, { operationId });
}

function reorder(state: TestShipState, operationId: string, index: number) {
    reorderRepair.setValue(state, { operationId, index });
}

function runTicks(repairManager: RepairManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        repairManager.update(id);
    }
}

describe('RepairManager', () => {
    it('runs queued operations strictly serially: exactly one active at a time', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'fixThrusters');
        enqueue(state, 'fixMagazine');
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations).to.have.lengthOf(2);
        expect(state.repairQueue.operations[0].protocolId).to.equal('fixThrusters');
        expect(state.repairQueue.operations[0].status).to.equal(RepairOperationStatus.ACTIVE);
        expect(state.repairQueue.operations[1].status).to.equal(RepairOperationStatus.QUEUED);

        runTicks(repairManager, 2, 20);

        // first op done and spliced out, second op is now active
        expect(state.repairQueue.operations).to.have.lengthOf(1);
        expect(state.repairQueue.operations[0].protocolId).to.equal('fixMagazine');
        expect(state.repairQueue.operations[0].status).to.equal(RepairOperationStatus.ACTIVE);
    });

    it('completing an operation resets its targets to normal and clears DAMAGED status', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        enqueue(state, 'fixThrusters');
        runTicks(repairManager, 2.1, 20);

        for (const thruster of state.thrusters) {
            expect(thruster.bearingSkew).to.equal(0);
        }
    });

    it('clear-at-done: a new defect landing on the target mid-operation is still cleared at completion', () => {
        const { state, repairManager } = setUpShip();
        state.magazine.capacity = 0.5; // already damaged before the operation is even enqueued
        enqueue(state, 'fixMagazine');
        tick(repairManager, 0.1); // promote to active (still 0.5 — not the normal value)

        state.magazine.capacity = 0.3; // a second, different defect arrives mid-operation
        runTicks(repairManager, 2, 20);

        // neither the pre-enqueue value (0.5) nor the mid-operation value (0.3) — the real normal
        expect(state.magazine.capacity).to.equal(1);
    });

    it('an active operation draws its declared energy per tick from the reactor', () => {
        const { state, repairManager } = setUpShip();
        const before = state.reactor.energy;
        enqueue(state, 'fixMagazine');
        tick(repairManager, 1);

        expect(before - state.reactor.energy).to.be.closeTo(10, 0.01);
    });

    it('survives a brief energy dip within the grace window: no abort, nothing lost', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        enqueue(state, 'fixThrusters');
        tick(repairManager, 0.1); // promote + apply side effect (thrusters power -> 0)
        expect(state.thrusters[0].power).to.equal(0);

        state.reactor.energy = 0; // a momentary dip — well under ENERGY_STARVATION_GRACE_SECONDS
        tick(repairManager, 0.5);
        state.reactor.energy = state.reactor.design.maxEnergy; // recovers

        expect(state.repairQueue.operations).to.have.lengthOf(1);
        expect(state.repairQueue.operations[0].status).to.equal(RepairOperationStatus.ACTIVE);
        expect(state.thrusters[0].power).to.equal(0); // side effect still applied, op still running
    });

    it('aborts the active operation all-or-nothing on a SUSTAINED energy shortfall: no restoration, side effects reverted', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        const priorPower = state.thrusters[0].power;
        enqueue(state, 'fixThrusters');
        tick(repairManager, 0.1); // promote + apply side effect (thrusters power -> 0)
        expect(state.thrusters[0].power).to.equal(0);

        state.reactor.energy = 0; // sustained shortfall — longer than the grace window
        runTicks(repairManager, 3, 20);

        // aborted: side effect reverted, target NOT restored to normal
        expect(state.thrusters[0].power).to.equal(priorPower);
        expect(state.thrusters[0].bearingSkew).to.equal(5);
        expect(state.repairQueue.operations).to.have.lengthOf(0);
    });

    it('surfaces a visible reason when a sustained energy shortfall aborts the active operation', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'fixMagazine');
        tick(repairManager, 0.1); // promote to active

        state.reactor.energy = 0; // sustained shortfall — longer than the grace window
        runTicks(repairManager, 3, 20);

        expect(state.repairQueue.refusalReason).to.include('energy');
        expect(state.repairQueue.refusalSecondsRemaining).to.be.greaterThan(0);
    });

    it('cancelling a queued operation removes it at no cost', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'fixThrusters');
        enqueue(state, 'fixMagazine');
        tick(repairManager, 0.1);

        const queuedOp = state.repairQueue.operations[1];
        cancel(state, queuedOp.id);
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations.map((o) => o.protocolId)).to.deep.equal(['fixThrusters']);
    });

    it('cancelling the active operation aborts it all-or-nothing, letting the next queued operation start', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        enqueue(state, 'fixThrusters');
        enqueue(state, 'fixMagazine');
        tick(repairManager, 0.1);

        const activeOp = state.repairQueue.operations[0];
        cancel(state, activeOp.id);
        tick(repairManager, 0.1); // abort moves it to recentlyFinished and promotes the next op, same tick

        // aborted: target not restored
        expect(state.thrusters[0].bearingSkew).to.equal(5);
        expect(state.repairQueue.operations).to.have.lengthOf(1);
        expect(state.repairQueue.operations[0].protocolId).to.equal('fixMagazine');
        expect(state.repairQueue.operations[0].status).to.equal(RepairOperationStatus.ACTIVE);
    });

    it('queued operations can be reordered; the active operation cannot be demoted', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'fixThrusters');
        enqueue(state, 'fixMagazine');
        enqueue(state, 'heatDocking');
        tick(repairManager, 0.1);

        const activeOp = state.repairQueue.operations[0];
        const lastQueued = state.repairQueue.operations[2];
        // try to demote the active op — refused
        reorder(state, activeOp.id, 2);
        // move the last queued op to the front of the queued subset
        reorder(state, lastQueued.id, 1);
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations[0].id).to.equal(activeOp.id);
        expect(state.repairQueue.operations[0].status).to.equal(RepairOperationStatus.ACTIVE);
        expect(state.repairQueue.operations[1].id).to.equal(lastQueued.id);
    });

    it('invariant: the ACTIVE operation is always operations[0], even when "move up" targets index 0', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'fixThrusters');
        enqueue(state, 'fixMagazine');
        tick(repairManager, 0.1);

        const queuedOp = state.repairQueue.operations[1];
        // this is exactly what the repair-queue widget's "Move up" button sends for the row at
        // index 1: {index: 0} — the active operation must not be displaced from index 0
        reorder(state, queuedOp.id, 0);
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations[0].status).to.equal(RepairOperationStatus.ACTIVE);
        expect(state.repairQueue.operations[0].protocolId).to.equal('fixThrusters');
    });

    it('a protocolId colliding with an inherited Object.prototype member is refused, not crashed on', () => {
        const { state, repairManager } = setUpShip();
        for (const protocolId of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
            enqueue(state, protocolId);
        }

        expect(() => tick(repairManager, 0.1)).to.not.throw();
        expect(state.repairQueue.operations).to.have.lengthOf(0);
    });

    it('malformed command payloads degrade to a no-op instead of throwing out of the tick', () => {
        const { state, repairManager } = setUpShip();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state.repairQueue.enqueueCommands as any[]).push(null, 'garbage', 42, {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state.repairQueue.cancelCommands as any[]).push(null, 'garbage', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state.repairQueue.reorderCommands as any[]).push(null, 'garbage', {}, { operationId: 'x' });

        expect(() => tick(repairManager, 0.1)).to.not.throw();
        expect(state.repairQueue.operations).to.have.lengthOf(0);
    });

    it('does not overwrite a player-commanded power change on a side-effected system with a stale snapshot', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        enqueue(state, 'fixThrusters');
        tick(repairManager, 0.1); // promotes to active, side effect: thrusters power -> 0
        expect(state.thrusters[0].power).to.equal(0);

        state.thrusters[0].power = PowerLevel.MAX; // the pilot commands power back up mid-repair
        runTicks(repairManager, 2, 20); // let the operation complete

        // the player's later intent wins — completion must not snap it back to the pre-repair value
        expect(state.thrusters[0].power).to.equal(PowerLevel.MAX);
    });

    it('caps the queue length and refuses further enqueue commands once full', () => {
        const { state, repairManager } = setUpShip();
        for (let i = 0; i < 20; i++) {
            enqueue(state, 'fixMagazine');
        }
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations.length).to.be.at.most(16);
    });

    it('declared side effects apply on activation and revert on completion', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        const priorPower = state.thrusters[0].power;
        enqueue(state, 'fixThrusters');
        tick(repairManager, 0.1);
        expect(state.thrusters[0].power).to.equal(0);

        runTicks(repairManager, 2, 20);
        expect(state.thrusters[0].power).to.equal(priorPower);
    });

    it('heat from an active operation lands on its target systems', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'heatDocking');
        tick(repairManager, 1); // 1s tick, protocol.heat=100 over duration=5s -> +20 heat this tick

        expect(state.docking.heat).to.be.closeTo(20, 0.01);
    });

    it('declared heat is a fixed total budget, not multiplied by the target system instance count', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'heatThrusters');
        tick(repairManager, 1); // 1s tick, protocol.heat=24 over duration=4s -> +6 total this tick

        const totalHeat = state.thrusters.reduce((sum, t) => sum + t.heat, 0);
        expect(totalHeat).to.be.closeTo(6, 0.01);
    });

    it('repair heat pushing an already-hot system over the overheat threshold causes new damage', () => {
        const { state, repairManager } = setUpShip();
        state.docking.heat = 90;
        const before = state.docking.rangesFactor;
        enqueue(state, 'heatDocking');
        tick(repairManager, 1); // +20 heat: 90 -> clamped 100, 10 excess -> overheat damage

        expect(state.docking.heat).to.equal(100);
        expect(state.docking.rangesFactor).to.be.lessThan(before);
    });

    it('refuses to enqueue a protocol above the ship current repair tier, with a tier-specific message', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'dockedOnly');
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations).to.have.lengthOf(0);
        expect(state.repairQueue.refusalReason).to.match(/higher repair tier/);
    });

    it('enqueues and completes a docked-tier protocol once the ship is docked', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.reactor.effeciencyFactor = 0.5;
        enqueue(state, 'dockedOnly');
        runTicks(repairManager, 1.1, 20);

        expect(state.repairQueue.recentlyFinished).to.have.lengthOf(1);
        expect(state.repairQueue.recentlyFinished[0].status).to.equal(RepairOperationStatus.DONE);
        expect(state.reactor.effeciencyFactor).to.equal(1);
    });

    it('cancels an active docked-tier operation the moment the ship undocks mid-repair', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.reactor.effeciencyFactor = 0.5;
        enqueue(state, 'dockedOnly');
        tick(repairManager, 0.1); // promotes to ACTIVE while docked

        expect(state.repairQueue.operations[0].status).to.equal(RepairOperationStatus.ACTIVE);

        state.docking.mode = DockingMode.UNDOCKED;
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations).to.have.lengthOf(0);
        expect(state.repairQueue.recentlyFinished).to.have.lengthOf(1);
        expect(state.repairQueue.recentlyFinished[0].status).to.equal(RepairOperationStatus.CANCELLED);
        // aborted, not completed: the target was never reset to normal
        expect(state.reactor.effeciencyFactor).to.equal(0.5);
        expect(state.repairQueue.refusalReason).to.not.equal('');
    });

    it('refuses to enqueue an unknown protocol id', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'not-a-real-protocol');
        tick(repairManager, 0.1);

        expect(state.repairQueue.operations).to.have.lengthOf(0);
    });

    it('refuses to enqueue a protocol that targets a system this ship does not have, without throwing', () => {
        const { state, repairManager } = setUpShip({
            needsChainGun: {
                name: 'Needs a chain gun',
                targets: [{ system: 'chainGuns', field: 'bearingSkew' }],
                duration: 10,
                energyDraw: 1,
                heat: 0,
                sideEffectSystems: [],
                tier: 'field',
            },
        });
        state.chainGuns.splice(0); // simulate a ship design without a chain gun

        enqueue(state, 'needsChainGun');
        expect(() => tick(repairManager, 0.1)).to.not.throw();

        expect(state.repairQueue.operations).to.have.lengthOf(0);
        expect(state.repairQueue.refusalReason).to.not.equal('');
    });

    it('shows a refusal notice for TERMINAL_DISPLAY_SECONDS when an enqueue is refused, then clears it', () => {
        const { state, repairManager } = setUpShip();
        for (let i = 0; i < 16; i++) {
            enqueue(state, 'fixMagazine');
        }
        tick(repairManager, 0.1); // fills the queue to the cap

        enqueue(state, 'fixMagazine'); // refused: queue full
        tick(repairManager, 0.1);

        expect(state.repairQueue.refusalReason).to.not.equal('');
        expect(state.repairQueue.refusalSecondsRemaining).to.be.greaterThan(0);

        runTicks(repairManager, 3, 20); // longer than TERMINAL_DISPLAY_SECONDS, no further enqueue attempts

        expect(state.repairQueue.refusalReason).to.equal('');
        expect(state.repairQueue.refusalSecondsRemaining).to.equal(0);
    });

    it('keeps a finished operation visible in recentlyFinished for TERMINAL_DISPLAY_SECONDS, then removes it', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'fixMagazine'); // duration 2s
        runTicks(repairManager, 2.1, 20); // completes

        expect(state.repairQueue.operations).to.have.lengthOf(0);
        expect(state.repairQueue.recentlyFinished).to.have.lengthOf(1);
        expect(state.repairQueue.recentlyFinished[0].status).to.equal(RepairOperationStatus.DONE);

        runTicks(repairManager, 3, 20); // longer than TERMINAL_DISPLAY_SECONDS

        expect(state.repairQueue.recentlyFinished).to.have.lengthOf(0);
    });

    it('keeps a cancelled operation visible in recentlyFinished as CANCELLED, distinct from DONE', () => {
        const { state, repairManager } = setUpShip();
        enqueue(state, 'fixMagazine');
        tick(repairManager, 0.1);

        const activeOp = state.repairQueue.operations[0];
        cancel(state, activeOp.id);
        tick(repairManager, 0.1);

        expect(state.repairQueue.recentlyFinished).to.have.lengthOf(1);
        expect(state.repairQueue.recentlyFinished[0].status).to.equal(RepairOperationStatus.CANCELLED);
    });

    it('a Schema.clone() + resetShipState cycle (NPC<->PC conversion) reverts a stranded side effect and empties the queue, without throwing', () => {
        const { state, repairManager, energyManager, heatManager } = setUpShip();
        const priorPower = state.thrusters[0].power;
        enqueue(state, 'fixThrusters');
        tick(repairManager, 0.1); // promotes to active, applies the side effect: thrusters power -> 0
        expect(state.thrusters[0].power).to.equal(0);

        const cloned = state.clone();
        resetShipState(cloned);

        // the side effect must be reverted by resetShipState itself — a fresh RepairManager for the
        // cloned state has no memory of the operation that was active on the pre-clone state
        expect(cloned.thrusters[0].power).to.equal(priorPower);
        expect(cloned.repairQueue.operations).to.have.lengthOf(0);

        const clonedManager = new RepairManager(cloned, energyManager, heatManager);
        expect(() => tick(clonedManager, 0.1)).to.not.throw();
    });
});
