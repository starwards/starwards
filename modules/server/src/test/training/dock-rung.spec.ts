import { DockingMode, RepairPriority, RepairProtocolSlot, fixArmor } from '@starwards/core/internal';
import { TRAINING_PLAYER_ID, createTrainingT0Map } from '../../scenarios/training';
import { runTraining, trainingScenarios } from './training-scenarios';
import { HeadlessGame } from '../headless-game';
import { TRAINING_DOCK_ID } from '../../scenarios/training-dock';
import fc from 'fast-check';

const start = (name: string, seed = 1) => {
    const scenario = trainingScenarios[name];
    const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
    return HeadlessGame.start(scenario.createMap(params), seed);
};

describe('playerArmor start state', () => {
    it('defaults to every plate healthy', () => {
        const game = HeadlessGame.start(createTrainingT0Map({ distance: 3000, bearing: 0 }), 1);
        const armor = game.shipManagers.get(TRAINING_PLAYER_ID)!.state.armor;
        expect(armor.numberOfHealthyPlates).toBe(armor.numberOfPlates);
    });

    it('D-dock-0of16 starts with 0 healthy plates, one allied station and no attackers', () => {
        const game = start('D-dock-0of16');
        const state = game.spaceManager.state;
        const armor = game.shipManagers.get(TRAINING_PLAYER_ID)!.state.armor;
        expect(armor.numberOfPlates).toBe(16);
        expect(armor.numberOfHealthyPlates).toBe(0);
        expect(state.getShip(TRAINING_DOCK_ID)!.faction).toBe(state.getShip(TRAINING_PLAYER_ID)!.faction);
        expect([...state.getAll('Spaceship')]).toHaveLength(2);
    });

    it('D-dock-0of16-late adds one distant attacker', () => {
        expect([...start('D-dock-0of16-late').spaceManager.state.getAll('Spaceship')]).toHaveLength(3);
    });
});

describe('dock metrics', () => {
    it('reports an unrepaired hull as not passed', () => {
        const scenario = trainingScenarios['D-dock-0of16'];
        const [params] = fc.sample(scenario.params, { seed: 1, numRuns: 1 });
        const { map, tracker } = scenario.trackDock!(params);
        const game = HeadlessGame.start(map, 1);
        expect(tracker.done(game)).toBe(false);
        game.tick(1);
        expect(tracker.done(game)).toBe(false);
        expect(tracker.outcome(game)).toMatchObject({
            platesAtStart: 16,
            platesIntactAtStart: 0,
            platesRepaired: 0,
            passedAt: null,
            launches: 0,
        });
    });
});

describe('runTraining on a dock-only rung', () => {
    it('reports the dock outcome and a failed pass when nothing docks', async () => {
        const result = await runTraining(trainingScenarios['D-dock-0of16'], { seed: 1, timeoutSeconds: 5 });
        expect(result.killed).toBe(false);
        expect(result.dock).toMatchObject({ platesIntactAtStart: 0, passedAt: null, launches: 0 });
    });
});

describe('dock rung details', () => {
    it('applies playerArmor to T0 and rejects out-of-range values', () => {
        const game = HeadlessGame.start(createTrainingT0Map({ distance: 3000, bearing: 0 }, { playerArmor: 4 }), 1);
        expect(game.shipManagers.get(TRAINING_PLAYER_ID)!.state.armor.numberOfHealthyPlates).toBe(4);
        expect(() =>
            HeadlessGame.start(createTrainingT0Map({ distance: 3000, bearing: 0 }, { playerArmor: 99 }), 1),
        ).toThrow(/playerArmor/);
    });

    it('reads the start state before any tick', () => {
        const scenario = trainingScenarios['D-dock-0of16'];
        const [params] = fc.sample(scenario.params, { seed: 1, numRuns: 1 });
        const { map, tracker } = scenario.trackDock!(params);
        const game = HeadlessGame.start(map, 1);
        expect(tracker.outcome(game)).toMatchObject({ platesAtStart: 16, platesIntactAtStart: 0 });
    });

    it('tracks the late attacker as the rung enemy', () => {
        expect(trainingScenarios['D-dock-0of16-late'].enemies).toHaveLength(1);
    });
});

describe('dock metrics over a scripted dock', () => {
    const setup = () => {
        const scenario = trainingScenarios['D-dock-0of16'];
        const [params] = fc.sample(scenario.params, { seed: 1, numRuns: 1 });
        const { map, tracker } = scenario.trackDock!(params);
        const game = HeadlessGame.start(map, 1, { crewedPlayer: true });
        const state = game.shipManagers.get(TRAINING_PLAYER_ID)!.state;
        const slot = (id: string): RepairProtocolSlot => state.repairQueue.slots.find((s) => s.protocolId === id)!;
        return { game, tracker, state, slot };
    };

    it('counts a launch through UNDOCKING and the docked seconds', () => {
        const { game, tracker, state } = setup();
        state.docking.mode = DockingMode.DOCKED;
        game.tick(1);
        tracker.done(game);
        game.tick(1);
        tracker.done(game);
        state.docking.mode = DockingMode.UNDOCKING;
        game.tick(1);
        tracker.done(game);
        state.docking.mode = DockingMode.UNDOCKED;
        game.tick(1);
        tracker.done(game);
        const outcome = tracker.outcome(game);
        expect(outcome.launches).toBe(1);
        expect(outcome.dockedSeconds).toBeCloseTo(2, 0);
        expect(outcome.launchesPerMinute).toBeGreaterThan(0);
    });

    it('passes once every plate is intact and counts the repaired plates', () => {
        const { game, tracker, state } = setup();
        fixArmor(state.armor);
        game.tick(1);
        expect(tracker.done(game)).toBe(true);
        const outcome = tracker.outcome(game);
        expect(outcome.platesRepaired).toBe(16);
        expect(outcome.passedAt).not.toBeNull();
    });

    it('flags an overhaul preempting a running renewal, not one merely queued behind it', () => {
        // the tracker is read between ticks, so the slots are set as the repair manager would have left them
        const queued = setup();
        queued.slot('armorPlateRenewal').priority = RepairPriority.RUNNING;
        queued.tracker.done(queued.game);
        queued.slot('feedSystemOverhaul').priority = RepairPriority.HIGH;
        queued.tracker.done(queued.game);
        expect(queued.tracker.outcome(queued.game).overhaulPreemptedRenewal).toBe(false);

        const preempted = setup();
        preempted.slot('armorPlateRenewal').priority = RepairPriority.RUNNING;
        preempted.tracker.done(preempted.game);
        preempted.slot('feedSystemOverhaul').priority = RepairPriority.HIGH;
        preempted.slot('armorPlateRenewal').priority = RepairPriority.CANCELLING;
        preempted.tracker.done(preempted.game);
        expect(preempted.tracker.outcome(preempted.game).overhaulPreemptedRenewal).toBe(true);
    });

    it('does not count a bump-out as a launch', () => {
        const { game, tracker, state } = setup();
        for (const mode of [DockingMode.DOCKED, DockingMode.DOCKING, DockingMode.DOCKED, DockingMode.UNDOCKING]) {
            state.docking.mode = mode;
            tracker.done(game);
        }
        expect(tracker.outcome(game).launches).toBe(0);
        state.docking.mode = DockingMode.UNDOCKED;
        tracker.done(game);
        expect(tracker.outcome(game).launches).toBe(1);
    });

    it('counts repairs, not the net of repairs and re-breaks', () => {
        const { game, tracker, state } = setup();
        const plates = state.armor.armorPlates;
        const restore = (plate: number) => plates[plate].layers.forEach((l) => (l.health = l.maxHealth));
        const breakPlate = (plate: number) => plates[plate].layers.forEach((l) => (l.health = 0));
        restore(0);
        tracker.done(game);
        breakPlate(0);
        tracker.done(game);
        restore(0);
        restore(1);
        tracker.done(game);
        expect(tracker.outcome(game).platesRepaired).toBe(3);
    });

    it('does not flag a forced stop as preemption, and survives a cleared queue', () => {
        const { game, tracker, slot, state } = setup();
        slot('armorPlateRenewal').priority = RepairPriority.RUNNING;
        tracker.done(game);
        slot('feedSystemOverhaul').priority = RepairPriority.HIGH;
        const renewal = slot('armorPlateRenewal');
        renewal.priority = RepairPriority.OFF;
        renewal.refusalReason = 'lost repair tier';
        tracker.done(game);
        expect(tracker.outcome(game).overhaulPreemptedRenewal).toBe(false);
        state.repairQueue.slots.clear();
        expect(() => tracker.done(game)).not.toThrow();
    });
});
