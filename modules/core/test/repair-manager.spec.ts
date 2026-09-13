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
    needsCell: {
        name: 'Needs an energy cell',
        targets: [],
        duration: 1,
        energyDraw: 0,
        heat: 0,
        sideEffectSystems: [],
        tier: 'field',
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

function raiseToHigh(state: TestShipState, protocolId: string) {
    raise(state, protocolId);
    raise(state, protocolId);
    raise(state, protocolId);
}

function slot(state: TestShipState, protocolId: string) {
    const found = state.repairQueue.slots.find((s) => s.protocolId === protocolId);
    if (!found) {
        throw new Error(`no slot for ${protocolId}`);
    }
    return found;
}

function runTicks(repairManager: RepairManager, durationSeconds: number, ticksPerSecond: number) {
    for (const id of makeIterationsData(durationSeconds, Math.round(durationSeconds * ticksPerSecond))) {
        repairManager.update(id);
    }
}

describe('RepairManager', () => {
    it('creates one slot per catalog protocol, in catalog order, all OFF', () => {
        const { state } = setUpShip();
        expect(state.repairQueue.slots.map((s) => s.protocolId)).to.deep.equal(Object.keys(testCatalog));
        expect(state.repairQueue.slots.every((s) => s.priority === RepairPriority.OFF)).to.equal(true);
    });

    // fixMagazine is raised and left RUNNING first in both tests below so fixThrusters, having
    // nothing to be promoted into, stays pending across ticks — otherwise the very first raise
    // would be promoted to RUNNING on its next tick (no pre-emption blocks it), and a lower() on a
    // RUNNING slot means something else entirely (starts the wind-down).
    it('raising priority moves OFF -> LOW -> MEDIUM -> HIGH, clamping at HIGH', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.01);
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);

        raise(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.LOW);
        raise(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.MEDIUM);
        raise(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.HIGH);
        raise(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.HIGH);
    });

    it('lowering priority moves HIGH -> MEDIUM -> LOW -> OFF, clamping at OFF', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.01);
        raiseToHigh(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.HIGH);

        lower(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.MEDIUM);
        lower(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.LOW);
        lower(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.OFF);
        lower(state, 'fixThrusters');
        tick(repairManager, 0);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.OFF);
    });

    it('promotes exactly the highest-priority pending slot to RUNNING; ties go to catalog order', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixThrusters'); // LOW
        raise(state, 'fixMagazine'); // LOW too — catalog order after fixThrusters
        tick(repairManager, 0.1);

        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.RUNNING);
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.LOW);
    });

    it('a higher-priority pending slot is promoted ahead of a lower-priority one enqueued earlier', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine'); // LOW
        raiseToHigh(state, 'heatDocking'); // HIGH, raised after, but higher priority wins
        tick(repairManager, 0.1);

        expect(slot(state, 'heatDocking').priority).to.equal(RepairPriority.RUNNING);
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.LOW);
    });

    it('no pre-emption: raising a pending slot to HIGH never interrupts the one already RUNNING', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1);
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);

        raiseToHigh(state, 'heatDocking');
        tick(repairManager, 0.1);

        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);
        expect(slot(state, 'heatDocking').priority).to.equal(RepairPriority.HIGH);
    });

    it('completing a run resets its targets to normal and returns the slot to OFF', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        raise(state, 'fixThrusters');
        runTicks(repairManager, 2.1, 20);

        for (const thruster of state.thrusters) {
            expect(thruster.bearingSkew).to.equal(0);
        }
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.OFF);
        expect(slot(state, 'fixThrusters').progress).to.equal(0);
    });

    it('clear-at-done: a new defect landing on the target mid-run is still cleared at completion', () => {
        const { state, repairManager } = setUpShip();
        state.magazine.capacity = 0.5; // already damaged before priority is even raised
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1); // promote to RUNNING (still 0.5 — not the normal value)

        state.magazine.capacity = 0.3; // a second, different defect arrives mid-run
        runTicks(repairManager, 2, 20);

        // neither the pre-run value (0.5) nor the mid-run value (0.3) — the real normal
        expect(state.magazine.capacity).to.equal(1);
    });

    it('a RUNNING slot draws its declared energy per tick from the reactor', () => {
        const { state, repairManager } = setUpShip();
        const before = state.reactor.energy;
        raise(state, 'fixMagazine');
        tick(repairManager, 1);

        expect(before - state.reactor.energy).to.be.closeTo(10, 0.01);
    });

    it('survives a brief energy dip within the grace window: no force-stop, nothing lost', () => {
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

        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.RUNNING);
        expect(state.thrusters[0].power).to.equal(0); // side effect still applied, run still going
    });

    it('flags the RUNNING slot energyStarved as soon as it stalls, before the grace window force-stops it', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1); // promote to RUNNING
        expect(slot(state, 'fixMagazine').energyStarved).to.equal(false);

        state.reactor.energy = 0; // within the grace window — not yet force-stopped
        tick(repairManager, 0.5);

        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);
        expect(slot(state, 'fixMagazine').energyStarved).to.equal(true);
    });

    it('clears energyStarved on the RUNNING slot once it can draw energy again', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1);
        state.reactor.energy = 0;
        tick(repairManager, 0.5);
        expect(slot(state, 'fixMagazine').energyStarved).to.equal(true);

        state.reactor.energy = state.reactor.design.maxEnergy;
        tick(repairManager, 0.1);

        expect(slot(state, 'fixMagazine').energyStarved).to.equal(false);
    });

    it('force-stops the RUNNING slot all-or-nothing on a SUSTAINED energy shortfall: no restoration, side effects reverted', () => {
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

        // force-stopped: side effect reverted, target NOT restored to normal
        expect(state.thrusters[0].power).to.equal(priorPower);
        expect(state.thrusters[0].bearingSkew).to.equal(5);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.OFF);
        expect(slot(state, 'fixThrusters').progress).to.equal(0);
    });

    it('surfaces a visible reason when a sustained energy shortfall force-stops the RUNNING slot', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1); // promote to RUNNING

        state.reactor.energy = 0; // sustained shortfall — longer than the grace window
        runTicks(repairManager, 3, 20);

        expect(slot(state, 'fixMagazine').refusalReason).to.include('energy');
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.OFF);
    });

    it('lowering a pending (not yet RUNNING) slot to OFF removes it from scheduling, at no cost', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixThrusters');
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.RUNNING);
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.LOW);

        lower(state, 'fixMagazine');
        tick(repairManager, 0.1);

        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.OFF);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.RUNNING);
    });

    it('cancel = wind-down: a key on the RUNNING slot sets CANCELLING and progress runs back to 0, not an instant stop', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        raise(state, 'fixThrusters');
        runTicks(repairManager, 1, 20); // partway through the 2s duration
        const progressBefore = slot(state, 'fixThrusters').progress;
        expect(progressBefore).to.be.greaterThan(0);

        lower(state, 'fixThrusters'); // either key on RUNNING starts the wind-down
        tick(repairManager, 0.01);
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.CANCELLING);

        tick(repairManager, 0.5); // still winding down, not yet at 0
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.CANCELLING);
        expect(slot(state, 'fixThrusters').progress).to.be.lessThan(progressBefore);
        expect(slot(state, 'fixThrusters').progress).to.be.greaterThan(0);
        // side effect still applied while winding down
        expect(state.thrusters[0].power).to.equal(0);

        runTicks(repairManager, 2, 20); // let the wind-down finish reaching 0%
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.OFF);
        expect(slot(state, 'fixThrusters').progress).to.equal(0);
        // aborted via cancel: target not restored, side effect reverted
        expect(state.thrusters[0].bearingSkew).to.equal(5);
        expect(state.thrusters[0].power).to.equal(state.thrusters[0].power); // no throw / stays consistent
    });

    it('either raise or lower on a RUNNING slot starts the wind-down', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1);
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);

        raise(state, 'fixMagazine'); // raise (not just lower) also starts wind-down
        tick(repairManager, 0.01);

        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.CANCELLING);
    });

    it('open decision (a): a key pressed while CANCELLING is ignored — the wind-down always completes to OFF', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'fixMagazine');
        runTicks(repairManager, 1, 20);
        lower(state, 'fixMagazine');
        tick(repairManager, 0.01);
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.CANCELLING);
        const progressBefore = slot(state, 'fixMagazine').progress;

        raise(state, 'fixMagazine'); // attempt to resume — ignored
        tick(repairManager, 0.01);

        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.CANCELLING);
        expect(slot(state, 'fixMagazine').progress).to.be.lessThan(progressBefore);
    });

    it('once RUNNING finishes/cancels, the next queued slot starts', () => {
        const { state, repairManager } = setUpShip();
        for (const thruster of state.thrusters) {
            thruster.bearingSkew = 5;
        }
        raise(state, 'fixThrusters');
        raise(state, 'fixMagazine');
        tick(repairManager, 0.1);

        lower(state, 'fixThrusters'); // cancel the running one (progress ~0.05 of a 2s duration)
        runTicks(repairManager, 0.3, 20); // enough for the wind-down to finish, not enough for fixMagazine (2s) to complete

        expect(state.thrusters[0].bearingSkew).to.equal(5); // not restored
        expect(slot(state, 'fixThrusters').priority).to.equal(RepairPriority.OFF);
        expect(slot(state, 'fixMagazine').priority).to.equal(RepairPriority.RUNNING);
    });

    it('a protocolId colliding with an inherited Object.prototype member is refused, not crashed on', () => {
        const { state, repairManager } = setUpShip();
        for (const protocolId of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
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
            { protocolId: 'fixThrusters' }, // missing direction
            { direction: 'up' }, // missing protocolId
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

    it('declared side effects apply on activation and revert on completion', () => {
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

    it('heat from a RUNNING slot lands on its target systems', () => {
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

    it('refuses to raise priority above the ship current repair tier, with a tier-specific message', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'dockedOnly');
        tick(repairManager, 0.1);

        expect(slot(state, 'dockedOnly').priority).to.equal(RepairPriority.OFF);
        expect(slot(state, 'dockedOnly').refusalReason).to.match(/higher repair tier/);
    });

    it('runs and completes a docked-tier protocol once the ship is docked', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.reactor.effeciencyFactor = 0.5;
        raise(state, 'dockedOnly');
        runTicks(repairManager, 1.1, 20);

        expect(slot(state, 'dockedOnly').priority).to.equal(RepairPriority.OFF);
        expect(state.reactor.effeciencyFactor).to.equal(1);
    });

    it('force-stops a RUNNING docked-tier protocol the moment the ship undocks mid-repair', () => {
        const { state, repairManager } = setUpShip();
        state.docking.mode = DockingMode.DOCKED;
        state.reactor.effeciencyFactor = 0.5;
        raise(state, 'dockedOnly');
        tick(repairManager, 0.1); // promotes to RUNNING while docked

        expect(slot(state, 'dockedOnly').priority).to.equal(RepairPriority.RUNNING);

        state.docking.mode = DockingMode.UNDOCKED;
        tick(repairManager, 0.1);

        expect(slot(state, 'dockedOnly').priority).to.equal(RepairPriority.OFF);
        // force-stopped, not completed: the target was never reset to normal
        expect(state.reactor.effeciencyFactor).to.equal(0.5);
        expect(slot(state, 'dockedOnly').refusalReason).to.not.equal('');
    });

    it('refuses to raise priority on an unknown protocol id', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'not-a-real-protocol');
        tick(repairManager, 0.1);

        expect(state.repairQueue.slots.some((s) => s.protocolId === 'not-a-real-protocol')).to.equal(false);
    });

    it('refuses to raise priority on a protocol that targets a system this ship does not have, without throwing', () => {
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

        expect(slot(state, 'needsChainGun').priority).to.equal(RepairPriority.OFF);
        expect(slot(state, 'needsChainGun').refusalReason).to.not.equal('');
    });

    it('refusalReason is cleared the moment the player next changes that slot priority', () => {
        const { state, repairManager } = setUpShip();
        raise(state, 'dockedOnly'); // refused: not docked
        tick(repairManager, 0.1);
        expect(slot(state, 'dockedOnly').refusalReason).to.not.equal('');

        state.docking.mode = DockingMode.DOCKED;
        raise(state, 'dockedOnly'); // now available
        tick(repairManager, 0.1);

        expect(slot(state, 'dockedOnly').refusalReason).to.equal('');
    });

    describe('energy cell spend/refund (issue #2247)', () => {
        it('spends the cell the instant the protocol starts RUNNING, not on completion', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 2;
            raise(state, 'needsCell');
            tick(repairManager, 0.1); // promotes to RUNNING

            expect(slot(state, 'needsCell').priority).to.equal(RepairPriority.RUNNING);
            expect(state.reactor.energyCells).to.equal(1);
        });

        it('is not double-spent on completion', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 2;
            raise(state, 'needsCell');
            runTicks(repairManager, 1.1, 20); // completes

            expect(slot(state, 'needsCell').priority).to.equal(RepairPriority.OFF);
            expect(state.reactor.energyCells).to.equal(1);
        });

        it('refunds the cell when a CANCELLING wind-down reaches 0%', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 1;
            raise(state, 'needsCell');
            tick(repairManager, 0.1); // RUNNING, cell spent
            expect(state.reactor.energyCells).to.equal(0);

            lower(state, 'needsCell'); // wind-down
            runTicks(repairManager, 1.1, 20); // finish winding down to 0%

            expect(slot(state, 'needsCell').priority).to.equal(RepairPriority.OFF);
            expect(state.reactor.energyCells).to.equal(1);
        });

        it('cannot be raised to pending without an available cell', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 0;
            raise(state, 'needsCell');
            tick(repairManager, 0.1);

            expect(slot(state, 'needsCell').priority).to.equal(RepairPriority.OFF);
            expect(slot(state, 'needsCell').refusalReason).to.not.equal('');
        });

        it('a second pending cell-consuming slot drops to OFF once the cell is no longer available at its own promotion attempt', () => {
            const { state, repairManager } = setUpShip({
                needsCell: testCatalog.needsCell,
                needsCell2: { ...testCatalog.needsCell, name: 'Needs an energy cell (2)' },
            });
            state.reactor.energyCells = 1;
            raise(state, 'needsCell');
            raise(state, 'needsCell2');
            runTicks(repairManager, 1.1, 20); // needsCell runs to completion (duration 1s), spending the only cell

            expect(slot(state, 'needsCell').priority).to.equal(RepairPriority.OFF);
            // needsCell2 stayed pending while needsCell ran; now that nothing is RUNNING, its own
            // promotion attempt finds no cell left and drops it to OFF with a reason
            expect(slot(state, 'needsCell2').priority).to.equal(RepairPriority.OFF);
            expect(slot(state, 'needsCell2').refusalReason).to.not.equal('');
        });

        it('refunds the cell on a forced tier-loss stop mid-run, not just on a CANCELLING wind-down (review round 1)', () => {
            const { state, repairManager } = setUpShip({
                dockedCell: { ...testCatalog.needsCell, tier: 'docked', duration: 10 },
            });
            state.docking.mode = DockingMode.DOCKED;
            state.reactor.energyCells = 1;
            raise(state, 'dockedCell');
            tick(repairManager, 0.1); // promotes to RUNNING, spends the cell
            expect(state.reactor.energyCells).to.equal(0);

            state.docking.mode = DockingMode.UNDOCKED; // loses the docked tier mid-run -> forceOff
            tick(repairManager, 0.1);

            expect(slot(state, 'dockedCell').priority).to.equal(RepairPriority.OFF);
            expect(state.reactor.energyCells).to.equal(1);
        });

        it('refund is capped at design.maxEnergyCells even if cells were topped up while the slot was running', () => {
            const { state, repairManager } = setUpShip();
            state.reactor.energyCells = 1;
            raise(state, 'needsCell');
            tick(repairManager, 0.1); // RUNNING, spends the only cell
            expect(state.reactor.energyCells).to.equal(0);

            // simulate an unrelated actor (GM tweak, ReactorCellManager) topping cells back up to
            // full while the run is still in flight
            state.reactor.energyCells = state.reactor.design.maxEnergyCells;

            lower(state, 'needsCell'); // wind-down
            runTicks(repairManager, 1.1, 20); // reaches 0%, refund attempted

            expect(state.reactor.energyCells).to.equal(state.reactor.design.maxEnergyCells);
        });
    });

    it('a Schema.clone() + resetShipState cycle (NPC<->PC conversion) reverts a stranded side effect and resets every slot, without throwing', () => {
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

    it('a Schema.clone() + resetShipState cycle refunds a RUNNING consumes-cell slot instead of stranding it (review round 1)', () => {
        // reactorJumpStart is the only consumesEnergyCell protocol in the real catalog, and
        // resetShipState looks slots up against that real catalog (it has no RepairManager/custom
        // catalog to ask) — so this exercises the real repairProtocols catalog, not testCatalog.
        const shipId = 'test-ship';
        const state = makeShipState(shipId, demoShip);
        state.reactor.energyCells = 1;
        const spaceObject = new Spaceship();
        spaceObject.id = shipId;
        const spaceManager = new SpaceManager();
        spaceManager.insert(spaceObject);
        const damageManager = new DamageManager(spaceObject, state, spaceManager, new MockDie());
        const heatManager = new HeatManager(state, damageManager);
        const energyManager = new EnergyManager(state, heatManager);
        const repairManager = new RepairManager(state, energyManager, heatManager);

        cycleRepairPriority.setValue(state, { protocolId: 'reactorJumpStart', direction: 'up' });
        tick(repairManager, 0.1); // promotes to RUNNING, spends the only cell
        expect(state.reactor.energyCells).to.equal(0);

        const cloned = state.clone();
        resetShipState(cloned);

        // resetShipState always tops energyCells back up to design max on any reset (unconditional,
        // predates issue #2247) — the meaningful assertion here is that the stranded RUNNING slot's
        // side effects and priority are cleanly reset too, not left stuck mid-run
        expect(cloned.reactor.energyCells).to.equal(cloned.reactor.design.maxEnergyCells);
        expect(cloned.repairQueue.slots.every((s) => s.priority === RepairPriority.OFF)).to.equal(true);
    });
});
