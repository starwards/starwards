import { Intervention, buttonLevel, strategicLevel, tacticalLevel } from './levels';
import { RunSpec, fingerprint, runBranch } from './fork';

import { SavedGame, decodeFrame, parseFrameLine } from '@starwards/core/internal';
import fs from 'node:fs';
import { loadBrainSpec } from '@starwards/bots';
import os from 'node:os';
import path from 'node:path';
import { readRunLog } from './run-log';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';
import { runCrewTraining } from '../training/train-crew';

const crew = path.resolve(__dirname, '../../crews/captain-orders-reference.json');
const run: RunSpec = { crew, scenario: 'T3-directed', seed: 1, timeoutSeconds: 120 };

/** A branch's outcome as the fully analysed training run (recording ingested into its store) reports it. */
async function analysedOutcome(t: number, intervention?: Intervention) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branching-analysed-'));
    try {
        const result = await runCrewTraining(crew, {
            ...run,
            latencySeconds: 0.2,
            outDir: dir,
            intervalSimSeconds: 1,
            branch: intervention,
        });
        return {
            killed: result.killed,
            seconds: result.seconds,
            kills: result.kills,
            enemies: result.enemies,
            value: result.score?.value ?? null,
            ...fingerprint(result.recording!, t),
        };
    } finally {
        await rmDirRetrying(dir);
    }
}

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

    it('records the synced order board in every frame, and its changes as orders events', async () => {
        const recording = path.join(dir, 'captain-orders-reference', 'T3-directed_seed1.sgr');
        const frames = fs
            .readFileSync(recording, 'utf8')
            .split('\n')
            .flatMap((l) => parseFrameLine(l) ?? []);
        const last = await decodeFrame(SavedGame, frames[frames.length - 1].frame);
        const board = [...last.fragment.ship.values()].find((s) => s.isPlayerShip)!.orderBoard;
        expect(board.slots.get('maneuver')).toMatchObject({ issuer: 'captain' });
        expect(log.boards.length).toBeGreaterThan(0);
        expect(log.boards[log.boards.length - 1].board.orders.find((o) => o.slot === 'maneuver')?.kind).toBe(
            board.slots.get('maneuver')!.kind,
        );
    });

    it('scores a branch from its recording alone, as the analysed run scores it', async () => {
        expect(fs.readdirSync(path.join(dir, 'captain-orders-reference')).filter((f) => f.endsWith('.duckdb'))).toEqual(
            [],
        );
        expect(replay).toEqual(await analysedOutcome(0));
        const [point] = strategicLevel.points(log);
        // an intervention keeps state over its run: each run gets its own
        const hold = () => strategicLevel.alternatives(point, log).find((a) => a.id === 'hold_position')!.intervention;
        const branched = await runBranch(run, point.t, hold());
        expect(branched.killed).toBe(false);
        expect(branched).toEqual(await analysedOutcome(point.t, hold()));
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
