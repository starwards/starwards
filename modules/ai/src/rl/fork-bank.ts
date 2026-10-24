import fs from 'node:fs';
import { mix } from '@starwards/core/internal';
import path from 'node:path';
import { rng } from './mlp';

/**
 * Where RL episodes start: forks of guard runs (`npm run waves` results on training-only seeds) at fixed
 * times, replayed deterministically to the fork and reseeded there, or whole games (`t` 0). Held-out forks
 * come from seeds no training episode uses.
 */

export type Fork = { seed: number; t: number };
export type GuardRun = { seed: number; passed: boolean; holdSeconds: number };

export const FORK_TIMES = [400, 550, 700, 850];
/** A fork needs the guard run still going this long after it. */
const MARGIN_SECONDS = 30;

/** The guard runs in `npm run waves` output folders (their `*-waves.json`). */
export function readGuardBank(dirs: readonly string[]): GuardRun[] {
    return dirs.flatMap((dir) =>
        fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('-waves.json'))
            .flatMap((f) =>
                (
                    JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as {
                        seed: number;
                        passed: boolean;
                        fitness: { holdSeconds: number };
                    }[]
                ).map((r) => ({ seed: r.seed, passed: r.passed, holdSeconds: r.fitness.holdSeconds })),
            ),
    );
}

/** Each run's forks at `times` while it was still going. */
export function buildForks(runs: readonly GuardRun[], times: readonly number[] = FORK_TIMES): Fork[] {
    return runs.flatMap((r) =>
        times.filter((t) => t + MARGIN_SECONDS < r.holdSeconds).map((t) => ({ seed: r.seed, t })),
    );
}

/**
 * Splits `forks` by seed (order fixed by `salt`): held-out seeds are taken until they give `heldOut` forks
 * (the last seed's surplus dropped); every other seed trains.
 */
export function splitBank(forks: readonly Fork[], heldOut: number, salt = 1) {
    const seeds = [...new Set(forks.map((f) => f.seed))].sort((a, b) => mix(a, salt) - mix(b, salt) || a - b);
    const held: Fork[] = [];
    const heldSeeds = new Set<number>();
    for (const seed of seeds) {
        if (held.length >= heldOut) break;
        heldSeeds.add(seed);
        held.push(...forks.filter((f) => f.seed === seed));
    }
    return {
        train: forks.filter((f) => !heldSeeds.has(f.seed)),
        heldOut: held.slice(0, heldOut),
        trainSeeds: seeds.filter((s) => !heldSeeds.has(s)),
    };
}

/** A training start: a fork with probability `forkShare`, else a whole game of a training seed. */
export function sampleStart(
    bank: { train: readonly Fork[]; trainSeeds: readonly number[] },
    u: () => number,
    forkShare = 0.7,
): Fork {
    if (u() < forkShare) return bank.train[Math.floor(u() * bank.train.length)];
    return { seed: bank.trainSeeds[Math.floor(u() * bank.trainSeeds.length)], t: 0 };
}

/** Paired difference in pass (policy − reference) with a bootstrap 95% interval and exact McNemar counts. */
export function pairedSummary(pairs: { policy: boolean; reference: boolean }[], seed = 1) {
    const d = pairs.map((p) => Number(p.policy) - Number(p.reference));
    const diff = d.reduce((a, b) => a + b, 0) / d.length;
    const u = rng(seed);
    const boots = Array.from({ length: 4000 }, () => {
        let s = 0;
        for (let i = 0; i < d.length; i++) s += d[Math.floor(u() * d.length)];
        return s / d.length;
    }).sort((a, b) => a - b);
    return {
        n: d.length,
        policyPass: pairs.filter((p) => p.policy).length / d.length,
        referencePass: pairs.filter((p) => p.reference).length / d.length,
        diff,
        ci: [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]] as [number, number],
        policyOnly: d.filter((x) => x > 0).length,
        referenceOnly: d.filter((x) => x < 0).length,
    };
}
