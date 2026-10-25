import { AdversaryRun } from './report';
import { FingerprintProbe } from './fingerprint';
import { runCrewTraining } from '../training/train-crew';

/** The two adversary rung families: one raider on T1's layout, and the wave-defence rung. */
export const adversaryFamilies = {
    A1: { timeoutSeconds: 180, description: 'T1 layout: one dragonfly-MK1 attacking the GVTS' },
    AW: { timeoutSeconds: 1500, description: 'W-waves: raiders of every wave varied, three stations to defend' },
} as const;

export type AdversaryFamily = keyof typeof adversaryFamilies;

/** Plays one seed of `${family}-${profile}` with the fixed crew, fingerprinting every raider. */
export async function playAdversaryRun(options: {
    crewPath: string;
    family: AdversaryFamily;
    profile: string;
    seed: number;
    timeoutSeconds: number;
    intervalSimSeconds: number;
    outDir: string;
}): Promise<AdversaryRun> {
    const probe = new FingerprintProbe();
    const result = await runCrewTraining(options.crewPath, {
        scenario: `${options.family}-${options.profile}`,
        seed: options.seed,
        timeoutSeconds: options.timeoutSeconds,
        latencySeconds: 0.2,
        intervalSimSeconds: options.intervalSimSeconds,
        outDir: options.outDir,
        script: probe.script,
    });
    return {
        profile: options.profile,
        seed: options.seed,
        killed: result.killed,
        kills: result.kills,
        enemies: result.enemies,
        seconds: result.seconds,
        value: result.score?.value ?? null,
        waves: result.waves && { survived: result.waves.survived, stationsLost: result.waves.stationsLost },
        fingerprints: probe.result(),
    };
}
