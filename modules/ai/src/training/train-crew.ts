import { TrainingResult, runTraining, trainingScenarios } from '@starwards/server/src/test/training/training-scenarios';

import { ControlStats } from '../crew/crew';
import { TRAINING_PLAYER_ID } from '@starwards/server/src/scenarios/training';
import { headlessCrew } from '../crew/crew';
import { loadCrew } from '../crew/crew-config';
import path from 'node:path';

type CrewRunOptions = {
    scenario: string;
    seed: number;
    timeoutSeconds: number;
    latencySeconds: number;
    /** Where this crew's recordings go; the run is recorded every `intervalSimSeconds`. */
    outDir: string;
    intervalSimSeconds: number;
    jevRequestsPerMinute?: number;
};

/** A training run's outcome together with how the crew played it. */
export type CrewRunResult = TrainingResult & {
    crew: string;
    brains: string[];
    decisions: number;
    commands: number;
    refused: number;
    fallbacks: number;
    inputTokens: number;
    callouts: number;
    suppressed: number;
    controls: Record<string, ControlStats>;
};

/**
 * Plays one seed of a training rung with a crewed GVTS driven by the crew in `crewPath`, recording
 * every request, decision and command beside the game recording.
 */
export async function runCrewTraining(crewPath: string, options: CrewRunOptions): Promise<CrewRunResult> {
    const scenario = trainingScenarios[options.scenario];
    if (!scenario) {
        throw new Error(`unknown scenario ${options.scenario}; one of ${Object.keys(trainingScenarios).join(', ')}`);
    }
    const plan = loadCrew(crewPath, options.jevRequestsPerMinute);
    const crew = headlessCrew({
        shipId: TRAINING_PLAYER_ID,
        seats: plan.seats,
        latencySeconds: options.latencySeconds,
    });
    const result = await runTraining(scenario, {
        seed: options.seed,
        timeoutSeconds: options.timeoutSeconds,
        crewedPlayer: true,
        beforeTick: crew.beforeTick,
        recording: { dir: path.join(options.outDir, plan.name), intervalSimSeconds: options.intervalSimSeconds },
    });
    return {
        ...result,
        crew: plan.name,
        brains: plan.seats.map((s) => `${s.station}:${s.spec.id}@${s.spec.version}/${s.policy.name}`),
        ...crew.stats,
    };
}
