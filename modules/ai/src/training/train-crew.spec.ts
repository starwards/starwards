import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDecisionLog } from './decision-log';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';
import { runCrewTraining } from './train-crew';

const crews = path.resolve(__dirname, '../../crews');

describe('crew training', () => {
    jest.setTimeout(180_000);
    let outDir: string;
    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-training-'));
    });
    afterEach(() => rmDirRetrying(outDir));

    const run = (crew: string) =>
        runCrewTraining(path.join(crews, `${crew}.json`), {
            scenario: 'T0',
            seed: 1,
            timeoutSeconds: 120,
            latencySeconds: 0.2,
            outDir,
            intervalSimSeconds: 1,
        });

    it('a reference crew pressing buttons kills the T0 target, and its decisions are recorded beside the game', async () => {
        const result = await run('reference');
        expect(result.killed).toBe(true);
        expect(result.score!.value).toBeGreaterThan(0.3);
        expect(result).toMatchObject({ inputTokens: 0, cachedTokens: 0, cacheHits: 0, jevRequests: 0 });
        expect(result.refused).toBe(0);
        const log = readDecisionLog(result.recording!);
        expect(log.requests.length).toBeGreaterThan(0);
        expect(new Set(log.requests.map((r) => r.station))).toEqual(new Set(['helms', 'weapons', 'engineer']));
        expect(log.decisions.some((d) => d.control === 'fireChainGun:0' && d.choice === 'fire')).toBe(true);
        expect(log.decisions.every((d) => d.source === 'rule')).toBe(true);
    });

    it('an idle crew never kills', async () => {
        const result = await run('idle');
        expect(result.killed).toBe(false);
        expect(result.commands).toBe(0);
        expect(result.score!.value).toBeLessThan(0.05);
    });
});
