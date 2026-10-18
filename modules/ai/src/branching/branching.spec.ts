import { RunSpec, runBranch } from './fork';
import { buttonLevel, strategicLevel, tacticalLevel } from './levels';

import fs from 'node:fs';
import { loadBrainSpec } from '@starwards/bots';
import os from 'node:os';
import path from 'node:path';
import { readRunLog } from './run-log';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';

const crew = path.resolve(__dirname, '../../crews/captain-orders-reference.json');
const run: RunSpec = { crew, scenario: 'T3-directed', seed: 1, timeoutSeconds: 120 };

describe('captain branching', () => {
    jest.setTimeout(300_000);
    let dir: string;
    let replay: Awaited<ReturnType<typeof runBranch>>;
    let log: ReturnType<typeof readRunLog>;
    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branching-'));
        replay = await runBranch(run, 0, undefined, dir);
        log = readRunLog(path.join(dir, 'captain-orders-reference', 'T3-directed_seed1.sgr'));
    });
    afterAll(() => rmDirRetrying(dir));

    it('replays a captain crew run identically from its seed', async () => {
        const again = await runBranch(run, 0);
        expect(again).toEqual(replay);
        expect(replay.killed).toBe(true);
    });

    it('a strategic branch keeps the run up to its point and plays the new order state after it', async () => {
        const [point] = strategicLevel.points(log);
        expect(point.reasons).toContain('enemy in sight');
        const hold = strategicLevel.alternatives(point, log).find((a) => a.id === 'hold_position')!;
        const branched = await runBranch(run, point.t, hold.intervention);
        const base = await runBranch(run, point.t);
        expect(branched.prefix).toBe(base.prefix);
        expect(branched.whole).not.toBe(base.whole);
        expect(branched.killed).toBe(false);
    });

    it('a tactical branch has the captain call the alternative for its window', async () => {
        const level = tacticalLevel(loadBrainSpec(path.resolve(__dirname, '../../brains/captain-orders.v1.json')));
        const point = level.points(log).find((p) => p.taken === 'close_to')!;
        expect(point).toBeDefined();
        const alt = level.alternatives(point, log).find((a) => a.id === 'hold_here')!;
        const branched = await runBranch(run, point.t, alt.intervention);
        expect(branched.prefix).toBe((await runBranch(run, point.t)).prefix);
        expect(branched.whole).not.toBe(replay.whole);
    });

    it('a button branch presses another option of one control, conditioned on the order board', () => {
        const level = buttonLevel('helms', 'afterBurner');
        const [point] = level.points(log);
        expect(point.state.orders).toMatch(/maneuver=close_to/);
        expect(level.alternatives(point, log).map((a) => a.kind)).toEqual([
            point.taken === 'engage' ? 'release' : 'engage',
        ]);
    });
});
