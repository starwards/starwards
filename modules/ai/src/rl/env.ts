import { Outcome, RunSpec, runBranch, withReseed } from '../branching/fork';
import { REFERENCE_HEADS, ResidualHeads, setResidualWeaponsDecider } from '@starwards/bots';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { Intervention } from '../branching/levels';
import { STATIONS } from '@starwards/server/src/scenarios/wave-defence';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { stationDamage } from '@starwards/server/src/test/training/wave-rung';
import { weaponsFeatures } from './features';

/** One residual weapons decision: what the seat saw and the heads the policy chose. */
type Transition = { obs: number[]; heads: ResidualHeads };
/** Picks the heads from the observation alone; a head it leaves out is `ref`. */
type RlPolicy = (obs: number[]) => Partial<ResidualHeads>;

export const allReference: RlPolicy = () => REFERENCE_HEADS;

/**
 * Plays one episode of a crew whose weapons seat is `residual-weapons` with `policy` deciding its heads,
 * from `t` on when an `intervention` forks it (`runBranch`). The decider is process-wide: one episode at a time.
 */
export async function runEpisode(
    run: RunSpec,
    policy: RlPolicy,
    { t = 0, intervention }: { t?: number; intervention?: Intervention } = {},
): Promise<{ outcome: Outcome; transitions: Transition[] }> {
    const transitions: Transition[] = [];
    setResidualWeaponsDecider((display, heard) => {
        const obs = weaponsFeatures(display, heard);
        const heads = { ...REFERENCE_HEADS, ...policy(obs) };
        transitions.push({ obs, heads });
        return heads;
    });
    try {
        return { outcome: await runBranch(run, t, intervention), transitions };
    } finally {
        setResidualWeaponsDecider(undefined);
    }
}

/** Weights of the shaping potential Φ (`potential`). */
export const SHAPING = { capsule: 1, armor: 0.25, hull: 0.5, kill: 0.05, missile: 0.01 };

/** What the game looked like for shaping and tripwires, read off the game itself (never shown to the policy). */
export type GameReading = {
    capsuleLost: number;
    armorLost: number;
    hullDeficit: number;
    missiles: number;
    heShells: number;
    enemies: Set<string>;
};

export function readGame(game: HeadlessGame): GameReading {
    const { stationCapsuleLost, stationArmorLost } = stationDamage(game);
    const player = game.api.getShip(TRAINING_PLAYER_ID);
    const magazine = player?.state.magazine;
    const faction = player?.spaceObject.faction;
    const stations = new Set(STATIONS.map((s) => s.id));
    const enemies = new Set<string>();
    for (const ship of game.spaceManager.state.getAll('Spaceship')) {
        if (!ship.destroyed && ship.faction !== faction && !stations.has(ship.id)) enemies.add(ship.id);
    }
    return {
        capsuleLost: stationCapsuleLost,
        armorLost: stationArmorLost,
        hullDeficit: 1 - (player?.state.healthRatio ?? 0),
        missiles: (magazine?.count_HiExpMissile ?? 0) + (magazine?.count_ArmPenMissile ?? 0),
        heShells: magazine?.count_HiExpShell ?? 0,
        enemies,
    };
}

/** Shaping potential: station capsules and armour lost, GVTS hull deficit, kills since the fork, missiles in reserve. */
export function potential(r: GameReading, kills: number) {
    return (
        -SHAPING.capsule * r.capsuleLost -
        SHAPING.armor * r.armorLost -
        SHAPING.hull * r.hullDeficit +
        SHAPING.kill * kills +
        SHAPING.missile * r.missiles
    );
}

/** A decision from the fork on, with the shaping potential then. */
export type ForkStep = { obs: number[]; seconds: number; phi: number };
export type Tripwires = { missilesFired: number; kills: number; heEmptySeconds: number; firstLossAt: number | null };

/**
 * Plays `run` all-reference to `t`, reseeds its randomness there by `key` (all streams), then lets `decide`
 * choose the weapons heads at each decision. `steps[i]` is the `i`-th call of `decide`. Returns no steps when
 * the run ended before `t`.
 */
export async function runForkEpisode(
    run: RunSpec,
    { t, key }: { t: number; key: number },
    decide: (obs: number[], seconds: number) => Partial<ResidualHeads>,
): Promise<{ outcome: Outcome; steps: ForkStep[]; trip: Tripwires }> {
    const steps: ForkStep[] = [];
    let game: HeadlessGame | undefined;
    let last: GameReading | undefined;
    const seen = new Set<string>();
    const trip: Tripwires = { missilesFired: 0, kills: 0, heEmptySeconds: 0, firstLossAt: null };
    let lastSeconds = 0;
    const watch: Intervention = {
        script: (g) => {
            game = g;
            if (g.seconds + 1e-9 < t) return;
            const r = readGame(g);
            for (const id of r.enemies) seen.add(id);
            trip.kills = [...seen].filter((id) => !r.enemies.has(id)).length;
            if (last) {
                trip.missilesFired += Math.max(0, last.missiles - r.missiles);
                if (r.heShells === 0) trip.heEmptySeconds += g.seconds - lastSeconds;
            }
            last = r;
            lastSeconds = g.seconds;
        },
    };
    setResidualWeaponsDecider((display, heard) => {
        const seconds = game?.seconds ?? 0;
        if (seconds + 1e-9 < t || !last) return REFERENCE_HEADS;
        const obs = weaponsFeatures(display, heard);
        steps.push({ obs, seconds, phi: potential(last, trip.kills) });
        return { ...REFERENCE_HEADS, ...decide(obs, seconds) };
    });
    try {
        const outcome = await runBranch(run, t, withReseed(watch, t, key, 'all'));
        trip.firstLossAt = outcome.waves?.firstStationLostAt ?? null;
        return { outcome, steps, trip };
    } finally {
        setResidualWeaponsDecider(undefined);
    }
}

/**
 * Per-step rewards: shaping γΦ(next) − Φ(this), Φ after the last step being 0 (so shaping sums to −Φ(first)
 * and leaves the optimal policy unchanged), plus the terminal ±1 for pass/fail on the last step.
 */
export function rewards(steps: readonly ForkStep[], passed: boolean, gamma: number) {
    return steps.map((s, i) => {
        const next = i + 1 < steps.length ? steps[i + 1].phi : 0;
        return gamma * next - s.phi + (i === steps.length - 1 ? (passed ? 1 : -1) : 0);
    });
}
