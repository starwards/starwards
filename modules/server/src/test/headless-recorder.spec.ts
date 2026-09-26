import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { EVENTS_EXT, HeadlessRecorder, RecordedEvent } from './headless-recorder';
import { HeadlessGame, SERVER_TICK_HZ } from './headless-game';
import { T1Params, TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT1Map } from '../scenarios/training';
import { parseFrameLine, parseHeader } from '../recording/recording-format';

import { RECORDING_EXT } from '../recording/game-recorder';
import { SavedGame } from '../serialization/game-state-protocol';
import { XY } from '@starwards/core/internal';
import { stringToSchema } from '../serialization/game-state-serialization';

const params: T1Params = { distance: 3000, bearing: 0 };
const seed = 1;
const timeoutSeconds = 20;

describe('HeadlessRecorder', () => {
    let dir: string;
    let recorder: HeadlessRecorder;
    /** Ground truth from live state: the first tick each explosion overlaps the target. */
    const targetOverlaps: { explosionId: string; t: number }[] = [];

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-recorder-'));
        const game = HeadlessGame.start(createTrainingT1Map(params), seed);
        recorder = new HeadlessRecorder(game, dir, `training_t1_seed${seed}`, 1, params, SERVER_TICK_HZ);
        const seen = new Set<string>();
        await recorder.capture();
        while (game.seconds < timeoutSeconds) {
            game.tick(1 / SERVER_TICK_HZ);
            await recorder.capture();
            const target = game.spaceManager.state.get(TRAINING_TARGET_ID);
            if (!target || target.destroyed) {
                break;
            }
            for (const explosion of game.spaceManager.state.getAll('Explosion')) {
                if (
                    !seen.has(explosion.id) &&
                    !explosion.destroyed &&
                    XY.distance(explosion.position, target.position) < explosion.radius + target.radius
                ) {
                    seen.add(explosion.id);
                    targetOverlaps.push({ explosionId: explosion.id, t: game.seconds });
                }
            }
        }
        await recorder.capture(true);
    }, 60_000);

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const readEvents = () =>
        fs
            .readFileSync(recorder.filePath.replace(RECORDING_EXT, EVENTS_EXT), 'utf-8')
            .split('\n')
            .filter((line) => line)
            .map((line) => JSON.parse(line) as RecordedEvent);

    it('records a training run whose frames resume into the same trajectory', async () => {
        const [headerLine, ...frameLines] = fs.readFileSync(recorder.filePath, 'utf-8').trim().split('\n');
        const header = parseHeader(headerLine);
        expect(header).toMatchObject({ mapName: 'training_t1', seed, params, hz: SERVER_TICK_HZ });
        const frames = frameLines.map((line) => parseFrameLine(line)!);
        expect(frames.length).toBe(recorder.frameCount);

        // isFiring edges land at tick resolution, between 1 s frames, alternating start/stop per mount.
        const gvtsFire = readEvents().filter(
            (e) => e.kind !== 'blast_hit' && e.objectId === TRAINING_PLAYER_ID && e.mount === 0,
        );
        expect(gvtsFire[0]?.kind).toBe('fire_start');
        gvtsFire.forEach((e, i) => expect(e.kind).toBe(i % 2 ? 'fire_stop' : 'fire_start'));
        expect(gvtsFire.some((e) => Math.abs(e.t - Math.round(e.t)) > 1 / SERVER_TICK_HZ / 2)).toBe(true);

        const branch = frames.find((f) => f.t >= 10)!;
        const end = frames.find((f) => f.t >= 12)!;
        const saved = await stringToSchema(SavedGame, branch.frame);
        const expected = await stringToSchema(SavedGame, end.frame);
        const resumed = HeadlessGame.restore(
            saved,
            createTrainingT1Map(header.params as T1Params),
            header.seed ?? 0,
            branch.t,
        );
        while (resumed.seconds + 1e-9 < end.t) {
            resumed.tick(1 / (header.hz ?? SERVER_TICK_HZ));
        }
        // Not bit-exact: automation keeps private per-ship state (flight profile, gunnery latches)
        // that a SavedGame doesn't carry. Kept to 2 s: once blasts land, knock-back amplifies any
        // difference chaotically.
        for (const id of [TRAINING_PLAYER_ID, TRAINING_TARGET_ID]) {
            const actual = resumed.api.getObject(id)!.position;
            const recorded = expected.fragment.space.get(id)!.position;
            expect(Math.hypot(actual.x - recorded.x, actual.y - recorded.y)).toBeLessThan(50);
        }
    });

    it("records each explosion's first overlap with a ship once, on the tick it begins", () => {
        expect(targetOverlaps.length).toBeGreaterThan(0);
        const hits = readEvents().flatMap((e) =>
            e.kind === 'blast_hit' && e.objectId === TRAINING_TARGET_ID ? [{ explosionId: e.explosionId, t: e.t }] : [],
        );
        expect(hits).toEqual(targetOverlaps);
    });
});
