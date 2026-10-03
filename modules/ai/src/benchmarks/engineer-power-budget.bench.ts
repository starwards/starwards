import { FIGHT_SYSTEMS, SHIP, fightLoad, workingScorer } from './engineer-damage-control.bench';
import { Faction, ShipState, Spaceship, Vec2 } from '@starwards/core/internal';

import { Benchmark } from './benchmark';
import fc from 'fast-check';

type Params = { energy: number; firePeriod: number; fireOn: number };

/**
 * Power budget: a sustained helms and weapons load (turning and thrusting back and forth on the
 * afterburner, chain-gun bursts) entering the run with the store part-drained. At NORMAL reactor
 * power the load outruns the reactor and the store empties in 30–60 s, starving every system that
 * draws; the gun's bursts also heat it toward overheating. The engineer keeps the systems fed and
 * cool: shut down what the fight does not use, steer coolant, decide whether running the reactor hot
 * pays. Score: the time-mean share of the fight's systems doing their job (`systemsWorking`), where a
 * starved system counts as not working and powering a system below NORMAL counts against it.
 */
const engineerPowerBudget: Benchmark<Params> = {
    name: 'engineer-power-budget',
    station: 'engineer',
    description: 'keep the systems fed and cool under a sustained maneuvering and gunnery load',
    params: fc.record({
        energy: fc.integer({ min: 350, max: 650 }),
        firePeriod: fc.integer({ min: 4, max: 8 }),
        fireOn: fc.integer({ min: 2, max: 3 }),
    }),
    createMap: ({ energy, firePeriod, fireOn }) => {
        let state: ShipState;
        let t = 0;
        return {
            name: 'bench_engineer_power_budget',
            init: (game) => {
                state = game.addPlayerSpaceship(
                    new Spaceship().init(SHIP, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
                ).state;
                state.reactor.energy = energy;
            },
            update: (dt) => {
                if (dt <= 0) return;
                t += dt;
                fightLoad(state, t, firePeriod, fireOn);
            },
        };
    },
    shipId: SHIP,
    timeoutSeconds: 90,
    supporting: [],
    scorer: () => workingScorer(FIGHT_SYSTEMS),
};

export default engineerPowerBudget;
