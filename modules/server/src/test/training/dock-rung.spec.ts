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
            platesHealthyAtStart: 0,
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
        expect(result.dock).toMatchObject({ platesHealthyAtStart: 0, passedAt: null, launches: 0 });
    });
});
