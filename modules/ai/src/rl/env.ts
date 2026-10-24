import { Outcome, RunSpec, runBranch } from '../branching/fork';
import { REFERENCE_HEADS, ResidualHeads, setResidualWeaponsDecider } from '@starwards/bots';

import { Intervention } from '../branching/levels';
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
