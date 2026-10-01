import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    EVENTS_EXT,
    RecordingEventLine,
    SavedGame,
    XY,
    parseEventLine,
    parseFrameLine,
    parseHeader,
} from '@starwards/core/internal';
import { HeadlessGame, SERVER_TICK_HZ } from './headless-game';
import { T0Params, TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT1Map } from '../scenarios/training';

import { HeadlessRecorder } from './headless-recorder';
import { RECORDING_EXT } from '../recording/game-recorder';
import { decodeRecording } from './training/analysis/decode';
import { stringToSchema } from '../serialization/game-state-serialization';

const params: T0Params = { distance: 3000, bearing: 0 };
const seed = 1;
const timeoutSeconds = 20;
/** An extension event, as a station brain would record one, with an arbitrary JSON payload. */
const decision = { any: ['json', 1], nested: { ok: true } };

describe('HeadlessRecorder', () => {
    let dir: string;
    let recorder: HeadlessRecorder;
    /** Ground truth from live state: the first tick each explosion overlaps the target. */
    const targetOverlaps: { explosionId: string; t: number }[] = [];
    let decisionAt: number | undefined;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-recorder-'));
        const game = HeadlessGame.start(createTrainingT1Map(params), seed);
        recorder = new HeadlessRecorder(game, dir, `training_t1_seed${seed}`, 1, params, SERVER_TICK_HZ);
        const seen = new Set<string>();
        await recorder.capture();
        while (game.seconds < timeoutSeconds) {
            game.tick(1 / SERVER_TICK_HZ);
            if (decisionAt === undefined && game.seconds >= 2.5) {
                decisionAt = game.seconds;
                recorder.record('decision', TRAINING_PLAYER_ID, decision);
            }
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
            .map((line) => parseEventLine(line)!);

    it('records a training run whose frames resume into the same trajectory', async () => {
        const [headerLine, ...frameLines] = fs.readFileSync(recorder.filePath, 'utf-8').trim().split('\n');
        const header = parseHeader(headerLine);
        expect(header).toMatchObject({ mapName: 'training_t1', seed, params, hz: SERVER_TICK_HZ });
        const frames = frameLines.map((line) => parseFrameLine(line)!);
        expect(frames.length).toBe(recorder.frameCount);

        // isFiring edges land at tick resolution, between 1 s frames, alternating start/stop per mount.
        const gvtsFire = readEvents().filter(
            (e) =>
                (e.kind === 'fire_start' || e.kind === 'fire_stop') &&
                e.objectId === TRAINING_PLAYER_ID &&
                (e.data as { mount: number }).mount === 0,
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
            createTrainingT1Map(header.params as T0Params),
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
            e.kind === 'blast_hit' && e.objectId === TRAINING_TARGET_ID
                ? [{ explosionId: (e.data as { explosionId: string }).explosionId, t: e.t }]
                : [],
        );
        expect(hits).toEqual(targetOverlaps);
    });

    it('writes a record() event with any kind and JSON data to the sidecar, stamped with game time', () => {
        const recorded: RecordingEventLine[] = readEvents().filter((e) => e.kind === 'decision');
        expect(recorded).toEqual([{ t: decisionAt, kind: 'decision', objectId: TRAINING_PLAYER_ID, data: decision }]);
    });

    it('keeps the .sgr replayable when extension events were recorded', async () => {
        const [headerLine, ...frameLines] = fs.readFileSync(recorder.filePath, 'utf-8').trim().split('\n');
        expect(() => parseHeader(headerLine)).not.toThrow();
        // Replay readers count every non-header line as a frame, so each must be one.
        expect(frameLines.every((line) => parseFrameLine(line) !== null)).toBe(true);
        expect(frameLines.length).toBe(recorder.frameCount);
        let decoded = 0;
        for await (const _ of decodeRecording(recorder.filePath)) {
            decoded++;
        }
        expect(decoded).toBe(recorder.frameCount);
    });
});
