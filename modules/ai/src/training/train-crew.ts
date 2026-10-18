import { ControlStats, CrewOptions } from '../crew/crew';
import { RunScore, scoreRun } from '../scoring/run-score';
import {
    TrainingResult,
    TrainingRunOptions,
    playTraining,
    runTraining,
    trainingScenarios,
} from '@starwards/server/src/test/training/training-scenarios';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { SeatPlan } from '@starwards/bots';
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
    /** Acts on the game before the crew each tick: a scripted actor outside the station consoles. */
    script?: (game: HeadlessGame) => void;
    /** A branch: changes the crew's seats, its orders at the branch point, and what a seat is shown. */
    branch?: {
        seats?: (seats: SeatPlan[]) => SeatPlan[];
        intervene?: CrewOptions['intervene'];
        lens?: CrewOptions['lens'];
    };
};

/** A training run's outcome together with how the crew played it. */
export type CrewRunResult = TrainingResult & {
    crew: string;
    brains: string[];
    decisions: number;
    commands: number;
    refused: number;
    fallbacks: number;
    /** Tokens paid for in this run; a request answered from the answer cache adds to `cachedTokens` instead. */
    inputTokens: number;
    cachedTokens: number;
    jevRequests: number;
    cacheHits: number;
    callouts: number;
    suppressed: number;
    controls: Record<string, ControlStats>;
    timeoutSeconds: number;
    /** The run's snapshot scores averaged over its frames; null when no frame held both ships. */
    score: RunScore | null;
};

/** Seats the crew in `crewPath` on a training rung and gives `run` the tick hook and options that drive it. */
function crewed<R>(
    crewPath: string,
    options: CrewRunOptions,
    run: (scenario: (typeof trainingScenarios)[string], runOptions: TrainingRunOptions) => Promise<R>,
) {
    const scenario = trainingScenarios[options.scenario];
    if (!scenario) {
        throw new Error(`unknown scenario ${options.scenario}; one of ${Object.keys(trainingScenarios).join(', ')}`);
    }
    const plan = loadCrew(crewPath, options.jevRequestsPerMinute);
    const crew = headlessCrew({
        shipId: TRAINING_PLAYER_ID,
        seats: options.branch?.seats?.(plan.seats) ?? plan.seats,
        latencySeconds: options.latencySeconds,
        intervene: options.branch?.intervene,
        lens: options.branch?.lens,
    });
    const result = run(scenario, {
        seed: options.seed,
        timeoutSeconds: options.timeoutSeconds,
        crewedPlayer: true,
        beforeTick: (game, recorder) => {
            options.script?.(game);
            return crew.beforeTick(game, recorder);
        },
        recording: { dir: path.join(options.outDir, plan.name), intervalSimSeconds: options.intervalSimSeconds },
    });
    return { plan, crew, result };
}

/** Plays one seed of a training rung with the crew in `crewPath` and records it, without analysing the recording. */
export function playCrewTraining(crewPath: string, options: CrewRunOptions) {
    return crewed(crewPath, options, playTraining).result;
}

/**
 * Plays one seed of a training rung with a crewed GVTS driven by the crew in `crewPath`, recording
 * every request, decision and command beside the game recording.
 */
export async function runCrewTraining(crewPath: string, options: CrewRunOptions): Promise<CrewRunResult> {
    const { plan, crew, result: running } = crewed(crewPath, options, runTraining);
    const result = await running;
    const score = result.recording
        ? await scoreRun(result.recording, {
              killed: result.killed,
              seconds: result.seconds,
              timeoutSeconds: options.timeoutSeconds,
              playerId: TRAINING_PLAYER_ID,
          })
        : undefined;
    return {
        ...result,
        timeoutSeconds: options.timeoutSeconds,
        score: score ?? null,
        crew: plan.name,
        brains: plan.seats.map((s) => `${s.station}:${s.spec.id}@${s.spec.version}/${s.policy.name}`),
        ...crew.stats,
        cachedTokens: plan.jevUsage?.cachedTokens ?? 0,
        jevRequests: plan.jevUsage?.requests ?? 0,
        cacheHits: plan.jevUsage?.cacheHits ?? 0,
    };
}
