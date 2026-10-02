import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { JevClient, JevResponse } from './jev-client';
import { answerCacheFromEnv, applyCacheFlags, diskAnswerCache, jevCacheKey, meteredJevClient } from './jev-cache';

import { BrainRequest } from './request';

const request = (range: number): BrainRequest => ({
    state: { station: 'helms', console: [`target at ${range} m`] },
    questions: { boost: { type: 'choice', instructions: 'go?', criteria: { forward: 'f', hold: 'h' } } },
});

const answer = (choice: string, inputTokens: number): JevResponse => ({
    model: 'jev-1.13.0',
    inputTokens,
    latencyMs: 300,
    answers: { boost: { type: 'choice', choice, confidence: 0.9, probabilities: { [choice]: 0.9 } } },
});

describe('jev answer cache', () => {
    let dir: string;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-cache-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('keys a request by model, state and questions', () => {
        const key = jevCacheKey(request(900), 'jev-1.13.0');
        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(jevCacheKey(request(900), 'jev-1.13.0')).toBe(key);
        expect(jevCacheKey(request(901), 'jev-1.13.0')).not.toBe(key);
        expect(jevCacheKey(request(900), 'jev-1.14.0')).not.toBe(key);
        const reworded = request(900);
        reworded.questions.boost.instructions = 'go now?';
        expect(jevCacheKey(reworded, 'jev-1.13.0')).not.toBe(key);
    });

    it('pays for a request once, then answers it from disk, in this client or another', async () => {
        let paidRequests = 0;
        const paid: JevClient = {
            ask: () => Promise.resolve(answer(paidRequests++ ? 'hold' : 'forward', 700)),
        };
        const first = meteredJevClient(paid, diskAnswerCache(dir));
        const live = await first.ask(request(900), 'jev-1.13.0');
        const again = await first.ask(request(900), 'jev-1.13.0');
        const other = meteredJevClient(paid, diskAnswerCache(dir));
        const replayed = await other.ask(request(900), 'jev-1.13.0');

        expect(paidRequests).toBe(1);
        expect(again.answers).toEqual(live.answers);
        expect(replayed).toEqual({ model: 'jev-1.13.0', answers: live.answers, inputTokens: 0, latencyMs: 0 });
        expect(first.usage).toEqual({ requests: 2, cacheHits: 1, paidTokens: 700, cachedTokens: 700 });
        expect(other.usage).toEqual({ requests: 1, cacheHits: 1, paidTokens: 0, cachedTokens: 700 });

        await other.ask(request(901), 'jev-1.13.0');
        expect(paidRequests).toBe(2);
        expect(other.usage).toEqual({ requests: 2, cacheHits: 1, paidTokens: 700, cachedTokens: 700 });
    });

    it('without a cache every request is paid', async () => {
        const client = meteredJevClient({ ask: () => Promise.resolve(answer('forward', 100)) });
        await client.ask(request(900), 'jev-1.13.0');
        await client.ask(request(900), 'jev-1.13.0');
        expect(client.usage).toEqual({ requests: 2, cacheHits: 0, paidTokens: 200, cachedTokens: 0 });
    });

    it('does not cache a failed request', async () => {
        let calls = 0;
        const flaky: JevClient = {
            ask: () =>
                calls++ ? Promise.resolve(answer('forward', 100)) : Promise.reject(new Error('Jev answered 500')),
        };
        const client = meteredJevClient(flaky, diskAnswerCache(dir));
        await expect(client.ask(request(900), 'jev-1.13.0')).rejects.toThrow(/500/);
        expect((await client.ask(request(900), 'jev-1.13.0')).inputTokens).toBe(100);
        expect(client.usage).toMatchObject({ cacheHits: 0, paidTokens: 100 });
    });

    it('treats a damaged file as a miss and leaves no temporary files behind', () => {
        const cache = diskAnswerCache(dir);
        const key = jevCacheKey(request(900), 'jev-1.13.0');
        cache.put(key, answer('forward', 100));
        const shard = path.join(dir, key.slice(0, 2));
        expect(fs.readdirSync(shard)).toEqual([`${key}.json`]);
        expect(cache.get(key)).toMatchObject({ inputTokens: 100 });
        fs.writeFileSync(path.join(shard, `${key}.json`), '{"model":');
        expect(cache.get(key)).toBeUndefined();
    });

    it('takes the cache folder and the off switch from CLI flags through the environment', () => {
        const env: Record<string, string | undefined> = {};
        applyCacheFlags(['node', 'train', '--cache-dir', dir], env);
        expect(env.JEV_CACHE_DIR).toBe(path.resolve(dir));
        answerCacheFromEnv(env)!.put('abcdef', answer('forward', 1));
        expect(fs.existsSync(path.join(dir, 'ab', 'abcdef.json'))).toBe(true);
        applyCacheFlags(['node', 'train', '--no-cache'], env);
        expect(answerCacheFromEnv(env)).toBeUndefined();
    });
});
