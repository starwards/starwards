import * as fs from 'node:fs';
import * as path from 'node:path';

import { JevClient, JevResponse, jevBody } from './jev-client';

import { BrainRequest } from './request';
import { createHash } from 'node:crypto';

/** The training archive sits beside the repo checkouts in the workspace folder; the cache is kept there, outside git. */
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '../../../../../training-archive/jev-cache');

/** What is kept of one Jev answer: everything a decision is made from, and the tokens it was paid with. */
type CachedAnswer = Pick<JevResponse, 'model' | 'answers' | 'inputTokens'>;

export type JevAnswerCache = {
    get(key: string): CachedAnswer | undefined;
    put(key: string, answer: CachedAnswer): void;
};

type Env = Record<string, string | undefined>;

/** What a client asked over its life: `paidTokens` went to the API, `cachedTokens` were answered from disk. */
export type JevUsage = { requests: number; cacheHits: number; paidTokens: number; cachedTokens: number };

export type MeteredJevClient = JevClient & { usage: JevUsage };

/**
 * Identifies a request by the bytes Jev reads: the pinned model, the state and the questions, in the
 * order they are sent. Key order is part of the key because it is part of what the model is shown.
 */
export function jevCacheKey(request: BrainRequest, model: string) {
    return createHash('sha256').update(jevBody(request, model)).digest('hex');
}

/**
 * Answers on disk, one file per request under a two-character shard folder. A file is written whole
 * under a private name and renamed into place, so worker processes sharing the folder never read a
 * half-written answer; a failed read or write is a miss, never an error.
 */
export function diskAnswerCache(dir: string): JevAnswerCache {
    const file = (key: string) => path.join(dir, key.slice(0, 2), `${key}.json`);
    return {
        get(key) {
            try {
                return JSON.parse(fs.readFileSync(file(key), 'utf8')) as CachedAnswer;
            } catch {
                return undefined;
            }
        },
        put(key, answer) {
            const target = file(key);
            const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
            try {
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.writeFileSync(temp, JSON.stringify(answer));
                fs.renameSync(temp, target);
            } catch {
                fs.rmSync(temp, { force: true });
            }
        },
    };
}

/**
 * Counts what a client asks and, with a cache, answers a request already paid for from disk. Jev's
 * confidences drift by a few hundredths between identical requests and a near-tie can flip, so the
 * cache also pins a run: replayed on the same seed it makes the same decisions. A cached answer
 * reports no input tokens and no latency; its size is counted in `usage.cachedTokens`.
 */
export function meteredJevClient(inner: JevClient, cache?: JevAnswerCache): MeteredJevClient {
    const usage: JevUsage = { requests: 0, cacheHits: 0, paidTokens: 0, cachedTokens: 0 };
    return {
        usage,
        async ask(request, model) {
            usage.requests++;
            const key = cache && jevCacheKey(request, model);
            const cached = key ? cache.get(key) : undefined;
            if (cached) {
                usage.cacheHits++;
                usage.cachedTokens += cached.inputTokens;
                return { model: cached.model, answers: cached.answers, inputTokens: 0, latencyMs: 0 };
            }
            const response = await inner.ask(request, model);
            usage.paidTokens += response.inputTokens;
            if (key) {
                cache.put(key, { model: response.model, answers: response.answers, inputTokens: response.inputTokens });
            }
            return response;
        },
    };
}

/** The answer cache the environment asks for: `JEV_CACHE=off` for none, `JEV_CACHE_DIR` for another folder. */
export function answerCacheFromEnv(env: Env = process.env) {
    return env.JEV_CACHE === 'off' ? undefined : diskAnswerCache(env.JEV_CACHE_DIR ?? DEFAULT_CACHE_DIR);
}

/**
 * Turns a CLI's `--no-cache` and `--cache-dir <dir>` into the environment `answerCacheFromEnv` reads,
 * so the worker processes a CLI starts use the same cache.
 */
export function applyCacheFlags(argv: readonly string[] = process.argv, env: Env = process.env) {
    if (argv.includes('--no-cache')) {
        env.JEV_CACHE = 'off';
    }
    const dir = argv.indexOf('--cache-dir');
    if (dir >= 0) {
        env.JEV_CACHE_DIR = path.resolve(argv[dir + 1]);
    }
}
