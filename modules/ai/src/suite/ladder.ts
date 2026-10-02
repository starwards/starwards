import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** Where the curriculum's data lives: the ladder, the committed baselines, the lessons log. */
export const CURRICULUM_DIR = path.resolve(__dirname, '../../curriculum');

/** What a level makes harder (or wider) than the one before it. */
export const ladderAxes = ['baseline', 'variance', 'threat', 'internal', 'enemies', 'mission', 'space'] as const;

const seedsSchema = z.object({ first: z.number().int().min(1), count: z.number().int().min(1) }).strict();

const levelSchema = z
    .object({
        id: z.string().regex(/^L\d+[a-z]?$/),
        axis: z.enum(ladderAxes),
        /** What changed against the previous level, in one sentence. */
        changed: z.string().min(1),
        /** `placeholder`: named on the ladder, not built yet; the suite skips it. */
        status: z.enum(['built', 'placeholder']),
        /** Training rungs (`trainingScenarios` names) played by the whole crew. */
        rungs: z.array(z.string()),
        /** Station benchmarks (`benchmarks/<name>.bench.ts`) played by the crew's brain for that station. */
        benchmarks: z.array(z.string()),
        seeds: seedsSchema,
        timeoutSeconds: z.number().positive(),
        /** The level is mastered, and complexity may be added, once no new version improves `metric` beyond seed noise for `versions` versions in a row. */
        plateau: z
            .object({ metric: z.enum(['kills', 'medianSeconds', 'score']), versions: z.number().int().min(1) })
            .strict(),
        /** A candidate passes the level when every rung reaches these. */
        accept: z
            .object({
                killRate: z.number().min(0).max(1),
                medianSeconds: z.number().positive().optional(),
            })
            .strict(),
    })
    .strict()
    .refine((l) => l.status === 'placeholder' || l.rungs.length + l.benchmarks.length > 0, {
        message: 'a built level plays at least one rung or benchmark',
    });

/** How far a result may fall from its baseline before the suite calls it a regression. */
const regressionSchema = z
    .object({
        /** One-sided normal quantile of the noise bound on kills and benchmark scores (1.645 = 5%). */
        z: z.number().positive(),
        /** Median time to kill may grow by this share before it counts. */
        medianSlowdown: z.number().positive(),
        /** Fewest kills on both sides for a median comparison to mean anything. */
        minKillsForMedian: z.number().int().min(1),
        /** Benchmark mean score drops smaller than this never count, whatever the spread. */
        minScoreDrop: z.number().min(0),
    })
    .strict();

export const ladderSchema = z
    .object({ regression: regressionSchema, levels: z.array(levelSchema).min(1) })
    .strict()
    .refine((l) => new Set(l.levels.map((x) => x.id)).size === l.levels.length, { message: 'level ids are unique' });

export type Ladder = z.infer<typeof ladderSchema>;
export type Level = Ladder['levels'][number];
export type RegressionRule = Ladder['regression'];

export function loadLadder(file = path.join(CURRICULUM_DIR, 'ladder.json')): Ladder {
    return ladderSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
}
