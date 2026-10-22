import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { HeadlessGame, SERVER_TICK_HZ } from './headless-game';
import { RecordingEventLine, RecordingHeader, SavedGame, XY, parseEventLine } from '@starwards/core/internal';
import { T0Params, TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT1Map } from '../scenarios/training';

import { findSidecar, readSidecar } from '../recording/sidecar-file';
import { HeadlessRecorder } from './headless-recorder';
import { bytesToSchema } from '../serialization/game-state-serialization';
import { decodeRecording } from './training/analysis/decode';
import { readRecords } from '../recording/recording-file';

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
    /** Ground truth from live state: every projectile id seen after a tick. */
    const projectileIds = new Set<string>();

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-recorder-'));
        const game = HeadlessGame.start(createTrainingT1Map(params), seed);
        recorder = new HeadlessRecorder(game, dir, `training_t1_seed${seed}`, 1, params, SERVER_TICK_HZ);
        const seen = new Set<string>();
        recorder.capture();
        while (game.seconds < timeoutSeconds) {
            game.tick(1 / SERVER_TICK_HZ);
            if (decisionAt === undefined && game.seconds >= 2.5) {
                decisionAt = game.seconds;
                recorder.record('decision', TRAINING_PLAYER_ID, decision);
            }
            recorder.capture();
            for (const p of game.spaceManager.state.getAll('Projectile')) {
                projectileIds.add(p.id);
            }
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
        recorder.capture(true);
    }, 60_000);

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    async function readSgr(filePath: string) {
        let header!: RecordingHeader;
        const frames: { t: number; bytes: Uint8Array }[] = [];
        for await (const record of readRecords(filePath)) {
            if (record.kind === 'header') header = record.header;
            else if (record.kind === 'frame') frames.push(record);
        }
        return { header, frames };
    }

    it('writes its sidecar zstd-compressed beside the recording', () => {
        expect(recorder.eventsPath).toBe(recorder.filePath.replace(/\.sgr$/, '.events.jsonl.zst'));
        expect(findSidecar(recorder.filePath)).toBe(recorder.eventsPath);
    });

    const readEvents = () =>
        readSidecar(findSidecar(recorder.filePath)!)
            .split('\n')
            .filter((line) => line)
            .map((line) => parseEventLine(line)!);

    it('records a training run whose frames resume into the same trajectory', async () => {
        const { header, frames } = await readSgr(recorder.filePath);
        expect(header).toMatchObject({ mapName: 'training_t1', seed, params, hz: SERVER_TICK_HZ });
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
        const saved = bytesToSchema(SavedGame, branch.bytes);
        const expected = bytesToSchema(SavedGame, end.bytes);
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

    it('records every projectile once as a shot, with its shooter and ammo, and how it ended', () => {
        const events = readEvents();
        const shots = events.filter((e) => e.kind === 'shot');
        expect(new Set(shots.map((e) => e.objectId))).toEqual(projectileIds);
        expect(shots.length).toBe(projectileIds.size);
        const gvts = shots.filter((e) => (e.data as { shipId: string }).shipId === TRAINING_PLAYER_ID);
        expect(gvts.length).toBeGreaterThan(0);
        expect(gvts[0].data).toMatchObject({ ammo: 'HiExpShell', targetId: TRAINING_TARGET_ID });
        const ends = events.filter((e) => e.kind === 'projectile_end');
        expect(ends.length).toBeGreaterThan(0);
        for (const e of ends) {
            expect(projectileIds.has(e.objectId!)).toBe(true);
            expect(['detonate', 'impact', 'expire', 'shotDown']).toContain((e.data as { reason: string }).reason);
        }
        // a HiExp shell's proximity fuze is also its time fuze: it always ends in a blast
        const gvtsShells = new Set(gvts.map((e) => e.objectId));
        const gvtsEnds = ends.filter((e) => gvtsShells.has(e.objectId));
        expect(gvtsEnds.length).toBeGreaterThan(0);
        expect(gvtsEnds.every((e) => (e.data as { reason: string }).reason === 'detonate')).toBe(true);
    });

    it('records each weapon hit on a ship with who fired it and what it did', () => {
        const hits = readEvents().filter((e) => e.kind === 'damage' && e.objectId === TRAINING_TARGET_ID);
        expect(hits.length).toBeGreaterThan(0);
        for (const h of hits) {
            expect(h.data).toMatchObject({ shooterId: TRAINING_PLAYER_ID, damageType: 'HiExp', delivery: 'explosion' });
        }
        expect(hits.some((h) => (h.data as { plateLoss: number }).plateLoss > 0)).toBe(true);
    });

    it('records defects on ships with the system and cause', () => {
        const defects = readEvents().filter((e) => e.kind === 'defect');
        expect(defects.length).toBeGreaterThan(0);
        for (const d of defects) {
            const { system, cause } = d.data as { system: unknown; cause: unknown };
            expect(typeof system).toBe('string');
            expect(['hit', 'overheat', 'warp']).toContain(cause);
        }
    });

    it('writes a record() event with any kind and JSON data to the sidecar, stamped with game time', () => {
        const recorded: RecordingEventLine[] = readEvents().filter((e) => e.kind === 'decision');
        expect(recorded).toEqual([{ t: decisionAt, kind: 'decision', objectId: TRAINING_PLAYER_ID, data: decision }]);
    });

    it('keeps the .sgr replayable when extension events were recorded', async () => {
        const { header, frames } = await readSgr(recorder.filePath);
        expect(header.format).toBe('starwards-recording');
        expect(frames.length).toBe(recorder.frameCount);
        let decoded = 0;
        for await (const _ of decodeRecording(recorder.filePath)) {
            decoded++;
        }
        expect(decoded).toBe(recorder.frameCount);
    });

    it("records a crewed player ship's energy demand and grant with every frame", () => {
        const game = HeadlessGame.start(createTrainingT1Map(params), seed, { crewedPlayer: true });
        const crewed = new HeadlessRecorder(game, dir, 'crewed', 1, params, SERVER_TICK_HZ);
        crewed.capture();
        while (game.seconds < 5) {
            game.tick(1 / SERVER_TICK_HZ);
            crewed.capture();
        }
        crewed.capture(true);
        const flows = readSidecar(crewed.eventsPath)
            .split('\n')
            .filter((line) => line)
            .map((line) => parseEventLine(line)!)
            .filter((e) => e.kind === 'energy' && e.objectId === TRAINING_PLAYER_ID);
        expect(flows.length).toBe(crewed.frameCount);
        for (const f of flows) {
            const { demand, granted } = f.data as { demand: number; granted: number };
            expect(granted).toBeLessThanOrEqual(demand + 1e-9);
        }
        expect(flows.some((f) => (f.data as { demand: number }).demand > 0)).toBe(true);
    });
});
