import { Faction, PowerLevel, ShipState, Spaceship, Vec2, getSystems } from '@starwards/core/internal';

import { Benchmark } from './benchmark';
import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import fc from 'fast-check';

export const SHIP = 'GVTS';

/** The systems a fight's helms and weapons load runs on, plus the reactor that feeds them. */
export const FIGHT_SYSTEMS = /^\/(reactor|maneuvering|thrusters\/\d|chainGuns\/0)$/;

export function shipState(game: HeadlessGame): ShipState {
    const manager = game.shipManagers.get(SHIP);
    if (!manager) throw new Error('engineer benchmark ship is missing');
    return manager.state;
}

/**
 * How much of its job each system the fight uses is doing right now, 0–1, from the true state (the
 * referee's view): nothing when broken or starved of energy; otherwise its power up to NORMAL times
 * how close its defectible fields are to normal. Power above NORMAL earns nothing extra, so the score
 * rewards keeping systems working, not overdriving them.
 */
export function systemsWorking(state: ShipState, scored: RegExp) {
    const systems = getSystems(state).filter((s) => scored.test(s.pointer));
    const work = systems.map(({ state: s, defectibles }) => {
        if (s.broken || s.energyStarved) return 0;
        const health = defectibles.reduce((h, d) => h * (1 - Math.min(1, Math.abs(d.value - d.normal))), 1);
        return Math.min(1, s.power / PowerLevel.NORMAL) * health;
    });
    return work.reduce((a, b) => a + b, 0) / Math.max(1, work.length);
}

/** A scorer of the time-mean of `systemsWorking`, plus the energy store and heat that explain it. */
export function workingScorer(scored: RegExp) {
    let seconds = 0;
    let working = 0;
    let starvedSeconds = 0;
    let overheatSeconds = 0;
    let energy = 0;
    return {
        sample(game: HeadlessGame, dt: number) {
            const state = shipState(game);
            seconds += dt;
            working += systemsWorking(state, scored) * dt;
            energy += (state.reactor.energy / state.reactor.design.maxEnergy) * dt;
            if (state.reactor.energy <= 0) starvedSeconds += dt;
            if (state.systems().some((s) => s.heat >= 99.5)) overheatSeconds += dt;
        },
        result: () => ({
            score: seconds ? working / seconds : 0,
            meanEnergy: seconds ? energy / seconds : 0,
            emptySeconds: starvedSeconds,
            overheatSeconds,
        }),
    };
}

/**
 * The helms and weapons load of a running fight, scripted so it never varies with who sits there:
 * the ship turns and thrusts back and forth, holding the afterburner, and the chain gun fires bursts
 * of `fireOn` seconds every `firePeriod` with the magazine kept topped up.
 */
export function fightLoad(state: ShipState, t: number, firePeriod: number, fireOn: number) {
    const phase = Math.floor(t / 3) % 2 ? 1 : -1;
    state.smartPilot.rotation = phase;
    state.smartPilot.maneuvering.x = phase;
    state.smartPilot.maneuvering.y = -phase;
    state.afterBurnerCommand = 1;
    const firing = fireOn > 0 && t % firePeriod < fireOn;
    for (const gun of state.chainGuns) gun.isFiring = firing;
    state.magazine.count_HiExpShell = Math.max(state.magazine.count_HiExpShell, 100);
}

type Params = {
    brokenThrusters: [number, number];
    thrustersAt: number;
    gunAt: number;
    leakSystem: 'chainGuns/0' | 'maneuvering' | 'reactor';
    leakAt: number;
    reactorDies: boolean;
    reactorAt: number;
};

/**
 * Damage control: a light fight load (maneuvering, no gun fire) while scripted faults hit the GVTS at
 * seeded times: two thrusters lose all capacity; the chain gun's rate of fire drops to 30%; one
 * system takes a coolant leak (+4 heat/s, which the even coolant split cannot carry, so it
 * overheats in ~30 s unless the engineer gives it the coolant); on half the seeds the reactor dies
 * with the store empty (the jump-start trap). Score: the time-mean share of the fight's systems
 * (reactor, maneuvering, thrusters, chain gun) doing their job (`systemsWorking`). An idle engineer leaves every fault in place.
 */
const engineerDamageControl: Benchmark<Params> = {
    name: 'engineer-damage-control',
    station: 'engineer',
    description: 'keep systems working through scripted breakage, a coolant leak and a reactor failure',
    params: fc.record({
        brokenThrusters: fc
            .tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 1, max: 5 }))
            .map(([a, b]): [number, number] => [a, (a + b) % 6]),
        thrustersAt: fc.integer({ min: 3, max: 10 }),
        gunAt: fc.integer({ min: 8, max: 25 }),
        leakSystem: fc.constantFrom('chainGuns/0', 'maneuvering', 'reactor'),
        leakAt: fc.integer({ min: 3, max: 15 }),
        reactorDies: fc.boolean(),
        reactorAt: fc.integer({ min: 20, max: 40 }),
    }),
    createMap: (p) => {
        let state: ShipState;
        let addHeat: (value: number, system: ShipState['reactor']) => void;
        let t = 0;
        return {
            name: 'bench_engineer_damage_control',
            init: (game) => {
                const ship = game.addPlayerSpaceship(
                    new Spaceship().init(SHIP, new Vec2(0, 0), 'gravitas', Faction.Gravitas),
                );
                state = ship.state;
                // the leak heats through the game's own heat path, so overheating damages as it would in a fight
                addHeat = (value, system) => heatManagerOf(ship).addHeat(value, system);
            },
            update: (dt) => {
                if (dt <= 0) return;
                const before = t;
                t += dt;
                const at = (s: number) => before < s && t >= s;
                fightLoad(state, t, 1, 0);
                if (at(p.thrustersAt)) {
                    for (const i of p.brokenThrusters) state.thrusters[i].availableCapacity = 0;
                }
                if (at(p.gunAt)) state.chainGuns[0].rateOfFireFactor = 0.3;
                if (t >= p.leakAt) {
                    const leaking = state.systems().find((s) => p.leakSystem === pointerOf(state, s));
                    if (leaking) addHeat(4 * dt, leaking as ShipState['reactor']);
                }
                if (p.reactorDies && at(p.reactorAt)) {
                    state.reactor.effeciencyFactor = 0;
                    state.reactor.energy = 0;
                }
            },
        };
    },
    shipId: SHIP,
    timeoutSeconds: 90,
    supporting: [],
    scorer: () => workingScorer(FIGHT_SYSTEMS),
};

/** The ship manager's heat manager: protected in core, reached here only to script a heat fault. */
function heatManagerOf(ship: object) {
    return (ship as { heatManager: { addHeat(value: number, system: object): void } }).heatManager;
}

function pointerOf(state: ShipState, system: object) {
    return getSystems(state)
        .find((s) => s.state === system)
        ?.pointer.slice(1);
}

export default engineerDamageControl;
