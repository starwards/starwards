import { MockDie, makeIterationsData } from './ship-test-harness';
import { demoShip, makeShipState } from '../src';
import { DamageManager } from '../src/ship/damage-manager';
import { DockingMode } from '../src/ship/docking';
import { EnergyManager } from '../src/ship/energy-manager';
import { HeatManager } from '../src/ship/heat-manager';
import { PowerLevel } from '../src/ship/system';
import { RepairManager } from '../src/ship/repair-manager';
import { RepairPriority } from '../src/ship/repair-queue';
import { RepairProtocolStats } from '../src/configurations/repair-protocols';
import { SpaceManager } from '../src/logic/space-manager';
import { Spaceship } from '../src/space';
import { cycleRepairPriority } from '../src/ship/repair-commands';
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
    cellProtocol: {
        name: 'Cell-consuming protocol',
        targets: [{ system: 'reactor', field: 'effeciencyFactor' }],
        duration: 2,
        energyDraw: 0,
        heat: 0,
        sideEffectSystems: [],
        tier: 'field',
        consumesEnergyCell: true,
    },
    dockedCellProtocol: {
        name: 'Docked cell-consuming protocol',
        targets: [{ system: 'reactor', field: 'effeciencyFactor' }],
        duration: 5,
        energyDraw: 0,
        heat: 0,
        sideEffectSystems: [],
        tier: 'docked',
        consumesEnergyCell: true,
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

function raise(state: TestShipState, protocolId: string) {
    cycleRepairPriority.setValue(state, { protocolId, direction: 'up' });
}

function lower(state: TestShipState, protocolId: string) {
    cycleRepairPriority.setValue(state, { protocolId, direction: 'down' });
}

function slotFor(state: TestShipState, protocolId: string) {
    const slot = state.repairQueue.slots.find((s) => s.protocolId === protocolId);
    if (!slot) {
        throw new Error(`no repair slot for protocol "${protocolId}"`);
    }
    return slot;
}

function runTicks(repairManager: RepairManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        repairManager.update(id);
    }
}

describe('RepairManager', () => {
    it('promotes exactly one pending protocol to RUNNING at a time; the rest stay pending', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixThrusters');
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1);

        expect(slotFor(state, 'fixThrusters').priority).to.equal(RepairPriority.RUNNING);
        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.LOW);

        runTicks(repairManager, 2, 20);

        // fixThrusters completed -> OFF, fixMagazine is now promoted
        expect(slotFor(state, 'fixThrusters').priority).to.equal(RepairPriority.OFF);
        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);
    });

    it('ties within a priority tier are broken by catalog order', () => {
        const { state, repairManager } = setUpShip();
        // fixMagazine raised first, but fixThrusters is earlier in catalog order
        raise(state, 'fixMagazine');
        raise(state, 'fixThrusters');
        tick(repairManager, 0.1);

        expect(slotFor(state, 'fixThrusters').priority).to.equal(RepairPriority.RUNNING);
        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.LOW);
    });

    it('no pre-emption: raising a pending protocol to HIGH never interrupts the one already RUNNING', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1);
        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);

        raise(state, 'fixThrusters');
        raise(state, 'fixThrusters');
        raise(state, 'fixThrusters'); // LOW -> MEDIUM -> HIGH
        tick(repairManager, 0.1);

        expect(slotFor(state, 'fixThrusters').priority).to.equal(RepairPriority.HIGH);
        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);
    });

    it('completing a protocol resets its targets to normal and clears DAMAGED status', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        raise(state, 'fixThrusters');
        runTicks(repairManager, 2.1, 20);

        for (const thruster of state.thrusters) {
            expect(thruster.bearingSkew).to.equal(0);
        }
    });

    it('completion returns the protocol to OFF with no auto-repeat', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        runTicks(repairManager, 2.1, 20);

        const slot = slotFor(state, 'fixMagazine');
        expect(slot.priority).to.equal(RepairPriority.OFF);
        expect(slot.progress).to.equal(0);
        expect(slot.refusalReason).to.equal('');
    });

    it('clear-at-done: a new defect landing on the target mid-run is still cleared at completion', () => {
        const { state, repairManager } = setUpShip();
        state.magazine.capacity = 0.5; // already damaged before the protocol is even raised
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1); // promote to RUNNING (still 0.5 — not the normal value)

        state.magazine.capacity = 0.3; // a second, different defect arrives mid-run
        runTicks(repairManager, 2, 20);

        // neither the pre-run value (0.5) nor the mid-run value (0.3) — the real normal
        expect(state.magazine.capacity).to.equal(1);
    });

    it('a running protocol draws its declared energy per tick from the reactor', () => {
        const { state, repairManager } = setUpShip();
        const before = state.reactor.energy;
        raise(state, 'fixMagazine');
        tick(repairManager, 1);

        expect(before - state.reactor.energy).to.be.closeTo(10, 0.01);
    });

    it('survives a brief energy dip within the grace window: no abort, nothing lost', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        raise(state, 'fixThrusters');
        tick(repairManager, 0.1); // promote + apply side effect (thrusters power -> 0)
        expect(state.thrusters[0].power).to.equal(0);

        state.reactor.energy = 0; // a momentary dip — well under ENERGY_STARVATION_GRACE_SECONDS
        tick(repairManager, 0.5);
        state.reactor.energy = state.reactor.design.maxEnergy; // recovers

        expect(slotFor(state, 'fixThrusters').priority).to.equal(RepairPriority.RUNNING);
        expect(state.thrusters[0].power).to.equal(0); // side effect still applied, run still going
    });

    it('flags the running protocol energyStarved as soon as it stalls, before the grace window aborts it', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1); // promote to RUNNING
        expect(slotFor(state, 'fixMagazine').energyStarved).to.equal(false);

        state.reactor.energy = 0; // within the grace window — not yet aborted
        tick(repairManager, 0.5);

        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);
        expect(slotFor(state, 'fixMagazine').energyStarved).to.equal(true);
    });

    it('clears the running protocol energyStarved once it can draw energy again', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1);
        state.reactor.energy = 0;
        tick(repairManager, 0.5);
        expect(slotFor(state, 'fixMagazine').energyStarved).to.equal(true);

        state.reactor.energy = state.reactor.design.maxEnergy;
        tick(repairManager, 0.1);

        expect(slotFor(state, 'fixMagazine').energyStarved).to.equal(false);
    });

    it('aborts a running protocol all-or-nothing on a SUSTAINED energy shortfall: no restoration, side effects reverted', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        const priorPower = state.thrusters[0].power;
        raise(state, 'fixThrusters');
        tick(repairManager, 0.1); // promote + apply side effect (thrusters power -> 0)
        expect(state.thrusters[0].power).to.equal(0);

        state.reactor.energy = 0; // sustained shortfall — longer than the grace window
        runTicks(repairManager, 3, 20);

        // aborted: side effect reverted, target NOT restored to normal
        expect(state.thrusters[0].power).to.equal(priorPower);
        expect(state.thrusters[0].bearingSkew).to.equal(5);
        const slot = slotFor(state, 'fixThrusters');
        expect(slot.priority).to.equal(RepairPriority.OFF);
        expect(slot.refusalReason).to.include('energy');
    });

    it('lowering a pending (not yet running) protocol back to OFF costs nothing', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixThrusters');
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1); // fixThrusters RUNNING, fixMagazine LOW (pending)

        lower(state, 'fixMagazine');
        tick(repairManager, 0.1);

        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.OFF);
        expect(slotFor(state, 'fixThrusters').priority).to.equal(RepairPriority.RUNNING);
    });

    it('cancelling the running protocol winds its progress back down to 0 before returning it to OFF', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine'); // duration 2s
        runTicks(repairManager, 1, 20); // partway through
        const progressBeforeCancel = slotFor(state, 'fixMagazine').progress;
        expect(progressBeforeCancel).to.be.greaterThan(0);

        lower(state, 'fixMagazine'); // RUNNING -> CANCELLING, regardless of direction
        tick(repairManager, 0.1);

        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.CANCELLING);
        expect(slotFor(state, 'fixMagazine').progress).to.be.lessThan(progressBeforeCancel);

        runTicks(repairManager, 2, 20); // long enough for the wind-down to finish

        const slot = slotFor(state, 'fixMagazine');
        expect(slot.priority).to.equal(RepairPriority.OFF);
        expect(slot.progress).to.equal(0);
        // deliberate cancel, not a refusal — no reason to show
        expect(slot.refusalReason).to.equal('');
    });

    it('a priority key on a CANCELLING protocol is ignored — the wind-down always completes to OFF', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        runTicks(repairManager, 1, 20);
        lower(state, 'fixMagazine'); // starts winding down
        tick(repairManager, 0.1);
        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.CANCELLING);

        raise(state, 'fixMagazine'); // ignored — no resume mid-wind-down
        tick(repairManager, 0.1);

        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.CANCELLING);
    });

    it('cancelling the running protocol lets the next pending protocol start only once the wind-down completes', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        raise(state, 'fixThrusters');
        raise(state, 'fixMagazine');
        runTicks(repairManager, 1, 20); // fixThrusters RUNNING and well underway, fixMagazine pending

        lower(state, 'fixThrusters'); // begin wind-down
        tick(repairManager, 0.1);
        // still winding down — the pending protocol must not start yet
        expect(slotFor(state, 'fixThrusters').priority).to.equal(RepairPriority.CANCELLING);
        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.LOW);

        runTicks(repairManager, 2, 20); // wind-down finishes

        expect(slotFor(state, 'fixThrusters').priority).to.equal(RepairPriority.OFF);
        expect(state.thrusters[0].bearingSkew).to.equal(5); // aborted: target not restored
        expect(slotFor(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);
    });

    it('a protocolId colliding with an inherited Object.prototype member, or naming no real protocol, is a silent no-op', () => {
        const { state, repairManager } = setUpShip();
        for (const protocolId of [
            'constructor',
            'toString',
            'valueOf',
            '__proto__',
            'hasOwnProperty',
            'not-a-protocol',
        ]) {
            raise(state, protocolId);
        }

        expect(() => tick(repairManager, 0.1)).to.not.throw();
        expect(state.repairQueue.slots.every((s) => s.priority === RepairPriority.OFF)).to.equal(true);
    });

    it('malformed command payloads degrade to a no-op instead of throwing out of the tick', () => {
        const { state, repairManager } = setUpShip();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state.repairQueue.cyclePriorityCommands as any[]).push(
            null,
            'garbage',
            42,
            {},
            { protocolId: 'fixThrusters' },
        );

        expect(() => tick(repairManager, 0.1)).to.not.throw();
        expect(state.repairQueue.slots.every((s) => s.priority === RepairPriority.OFF)).to.equal(true);
    });

    it('does not overwrite a player-commanded power change on a side-effected system with a stale snapshot', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        raise(state, 'fixThrusters');
        tick(repairManager, 0.1); // promotes to RUNNING, side effect: thrusters power -> 0
        expect(state.thrusters[0].power).to.equal(0);

        state.thrusters[0].power = PowerLevel.MAX; // the pilot commands power back up mid-repair
        runTicks(repairManager, 2, 20); // let the run complete

        // the player's later intent wins — completion must not snap it back to the pre-repair value
        expect(state.thrusters[0].power).to.equal(PowerLevel.MAX);
    });

    it('declared side effects apply when the protocol starts running and revert on completion', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        const priorPower = state.thrusters[0].power;
        raise(state, 'fixThrusters');
        tick(repairManager, 0.1);
        expect(state.thrusters[0].power).to.equal(0);

        runTicks(repairManager, 2, 20);
        expect(state.thrusters[0].power).to.equal(priorPower);
    });

    it('heat from a running protocol lands on its target systems', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'heatDocking');
        tick(repairManager, 1); // 1s tick, protocol.heat=100 over duration=5s -> +20 heat this tick

        expect(state.docking.heat).to.be.closeTo(20, 0.01);
    });

    it('declared heat is a fixed total budget, not multiplied by the target system instance count', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'heatThrusters');
        tick(repairManager, 1); // 1s tick, protocol.heat=24 over duration=4s -> +6 total this tick

        const totalHeat = state.thrusters.reduce((sum, t) => sum + t.heat, 0);
        expect(totalHeat).to.be.closeTo(6, 0.01);
    });

    it('repair heat pushing an already-hot system over the overheat threshold causes new damage', () => {
        const { state, repairManager } = setUpShip();
        state.docking.heat = 90;
        const before = state.docking.rangesFactor;
        raise(state, 'heatDocking');
        tick(repairManager, 1); // +20 heat: 90 -> clamped 100, 10 excess -> overheat damage

        expect(state.docking.heat).to.equal(100);
        expect(state.docking.rangesFactor).to.be.lessThan(before);
    });

    it('refuses to raise a protocol above the ship current repair tier, with a tier-specific message', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'dockedOnly');
        tick(repairManager, 0.1);

        const slot = slotFor(state, 'dockedOnly');
        expect(slot.priority).to.equal(RepairPriority.OFF);
        expect(slot.refusalReason).to.match(/higher repair tier/);
    });

    it('the refusal reason clears once the protocol becomes available and is raised again', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'dockedOnly');
        tick(repairManager, 0.1);
        expect(slotFor(state, 'dockedOnly').refusalReason).to.not.equal('');

        state.docking.mode = DockingMode.DOCKED;
        raise(state, 'dockedOnly');
        tick(repairManager, 0.1);

        expect(slotFor(state, 'dockedOnly').refusalReason).to.equal('');
        expect(slotFor(state, 'dockedOnly').priority).to.equal(RepairPriority.RUNNING);
    });

    it('runs and completes a docked-tier protocol once the ship is docked', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.reactor.effeciencyFactor = 0.5;
        raise(state, 'dockedOnly');
        runTicks(repairManager, 1.1, 20);

        const slot = slotFor(state, 'dockedOnly');
        expect(slot.priority).to.equal(RepairPriority.OFF);
        expect(slot.refusalReason).to.equal('');
        expect(state.reactor.effeciencyFactor).to.equal(1);
    });

    it('a pending protocol that loses its tier (e.g. undocking) drops straight to OFF, nothing to revert', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        raise(state, 'fixThrusters'); // occupies RUNNING
        raise(state, 'dockedOnly'); // stays pending behind it
        tick(repairManager, 0.1);
        expect(slotFor(state, 'dockedOnly').priority).to.equal(RepairPriority.LOW);

        state.docking.mode = DockingMode.UNDOCKED;
        tick(repairManager, 0.1);

        expect(slotFor(state, 'dockedOnly').priority).to.equal(RepairPriority.OFF);
        expect(slotFor(state, 'dockedOnly').refusalReason).to.not.equal('');
    });

    it('aborts a running docked-tier protocol the moment the ship undocks mid-repair', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.reactor.effeciencyFactor = 0.5;
        raise(state, 'dockedOnly');
        tick(repairManager, 0.1); // promotes to RUNNING while docked

        expect(slotFor(state, 'dockedOnly').priority).to.equal(RepairPriority.RUNNING);

        state.docking.mode = DockingMode.UNDOCKED;
        tick(repairManager, 0.1);

        const slot = slotFor(state, 'dockedOnly');
        expect(slot.priority).to.equal(RepairPriority.OFF);
        // aborted, not completed: the target was never reset to normal
        expect(state.reactor.effeciencyFactor).to.equal(0.5);
        expect(slot.refusalReason).to.not.equal('');
    });

    it('refuses to raise a protocol that targets a system this ship does not have, without throwing', () => {
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

        raise(state, 'needsChainGun');
        expect(() => tick(repairManager, 0.1)).to.not.throw();

        const slot = slotFor(state, 'needsChainGun');
        expect(slot.priority).to.equal(RepairPriority.OFF);
        expect(slot.refusalReason).to.not.equal('');
    });

    describe('energy cell timing (issue #2247)', () => {
        it('is spent when the protocol starts running, not when it completes', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 1;
            raise(state, 'cellProtocol');

            expect(state.reactor.energyCells).to.equal(1); // still pending — not spent yet
            tick(repairManager, 0.1); // promotes to RUNNING

            expect(state.reactor.energyCells).to.equal(0);
        });

        it('is refunded when a CANCELLING wind-down reaches 0%', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 1;
            raise(state, 'cellProtocol');
            runTicks(repairManager, 1, 20); // partway through, cell already spent
            expect(state.reactor.energyCells).to.equal(0);

            lower(state, 'cellProtocol'); // begin wind-down
            runTicks(repairManager, 2, 20); // long enough to finish winding down

            expect(slotFor(state, 'cellProtocol').priority).to.equal(RepairPriority.OFF);
            expect(state.reactor.energyCells).to.equal(1);
        });

        it('is refunded on a self-abort (tier lost), not only a deliberate cancel', () => {
            const { state, repairManager } = setUpShip();
            state.docking.mode = DockingMode.DOCKED;
            state.reactor.energyCells = 1;
            raise(state, 'dockedCellProtocol');
            tick(repairManager, 0.1); // promotes to RUNNING, cell spent
            expect(state.reactor.energyCells).to.equal(0);
            expect(slotFor(state, 'dockedCellProtocol').priority).to.equal(RepairPriority.RUNNING);

            state.docking.mode = DockingMode.UNDOCKED; // self-abort: ship no longer qualifies for the tier
            tick(repairManager, 0.1);

            expect(slotFor(state, 'dockedCellProtocol').priority).to.equal(RepairPriority.OFF);
            expect(state.reactor.energyCells).to.equal(1);
        });

        it('stays spent — not refunded and not double-spent — once the run completes normally', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 2;
            raise(state, 'cellProtocol');
            runTicks(repairManager, 2.1, 20); // completes

            expect(slotFor(state, 'cellProtocol').priority).to.equal(RepairPriority.OFF);
            expect(state.reactor.energyCells).to.equal(1);
        });

        it('cannot be raised past the cells actually available', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 0;
            raise(state, 'cellProtocol');
            tick(repairManager, 0.1);

            const slot = slotFor(state, 'cellProtocol');
            expect(slot.priority).to.equal(RepairPriority.OFF);
            expect(slot.refusalReason).to.include('energy cell');
        });
    });

    it('a Schema.clone() + resetShipState cycle (NPC<->PC conversion) reverts a stranded side effect and resets every slot to OFF, without throwing', () => {
        const { state, repairManager, energyManager, heatManager } = setUpShip();
        const priorPower = state.thrusters[0].power;
        raise(state, 'fixThrusters');
        tick(repairManager, 0.1); // promotes to RUNNING, applies the side effect: thrusters power -> 0
        expect(state.thrusters[0].power).to.equal(0);

        const cloned = state.clone();
        resetShipState(cloned);

        // the side effect must be reverted by resetShipState itself — a fresh RepairManager for the
        // cloned state has no memory of the run that was active on the pre-clone state
        expect(cloned.thrusters[0].power).to.equal(priorPower);
        expect(cloned.repairQueue.slots.every((s) => s.priority === RepairPriority.OFF)).to.equal(true);

        const clonedManager = new RepairManager(cloned, energyManager, heatManager, testCatalog);
        expect(() => tick(clonedManager, 0.1)).to.not.throw();
    });
});
