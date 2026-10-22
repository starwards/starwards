import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { $changes, Schema } from '@colyseus/schema';
import {
    RecordingHeader,
    SavedGame,
    decodeFrameBytes,
    reconstructSegment,
    recordingSchemaHash,
    waitFor,
} from '@starwards/core/internal';
import { GameRecorder } from './game-recorder';
import { RecordingSerializer } from './recording-serializer';
import { makeDriver } from '../test/driver';
import { matchMaker } from '@colyseus/core';
import { readRecords } from './recording-file';

async function readRecording(filePath: string) {
    const recording = {
        header: null as RecordingHeader | null,
        frames: [] as { t: number; bytes: Uint8Array }[],
        bases: [] as { t: number; base: Record<string, Uint8Array> }[],
        segs: [] as { t: number; bytes: Uint8Array }[],
    };
    for await (const record of readRecords(filePath)) {
        if (record.kind === 'header') recording.header = record.header;
        else if (record.kind === 'frame') recording.frames.push(record);
        else if (record.kind === 'base') recording.bases.push(record);
        else recording.segs.push(record);
    }
    return { ...recording, header: recording.header! };
}

/** paths whose values differ; numbers compared with a tolerance relative to their magnitude */
function diffJson(a: unknown, b: unknown, tolerance = 1e-3, at = '', out: string[] = []): string[] {
    if (typeof a === 'number' && typeof b === 'number') {
        if (Math.abs(a - b) > tolerance * Math.max(1, Math.abs(a), Math.abs(b))) out.push(`${at}: ${a} != ${b}`);
    } else if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of keys) {
            const [x, y] = [(a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]];
            diffJson(x, y, tolerance, `${at}/${key}`, out);
        }
    } else if (a !== b) {
        out.push(`${at}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    }
    return out;
}

type Tree = { forEachChild(cb: (child: Tree) => void): void };

function changeTrees(state: Schema): Set<Tree> {
    const seen = new Set<Tree>();
    const visit = (tree: Tree) => {
        if (seen.has(tree)) return;
        seen.add(tree);
        tree.forEachChild(visit);
    };
    visit(state[$changes] as unknown as Tree);
    return seen;
}

describe('delta recording (SPEC-0006)', () => {
    const previousFlag = process.env.STARWARDS_RECORDING_DELTAS;
    beforeAll(() => {
        process.env.STARWARDS_RECORDING_DELTAS = '1';
    });
    afterAll(() => {
        if (previousFlag === undefined) delete process.env.STARWARDS_RECORDING_DELTAS;
        else process.env.STARWARDS_RECORDING_DELTAS = previousFlag;
    });

    const gameDriver = makeDriver({ recordEveryGame: false });
    let tmpDir: string;
    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'starwards-delta-recording-'));
    });
    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('rooms share no schema instance, and none has filters (T7)', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).wave_defence);
        const rooms = [...gameDriver.gameManager.state.shipIds, 'space'].map((id) => matchMaker.getLocalRoomById(id));
        expect(rooms.length).toBeGreaterThan(2);
        const owner = new Map<Tree, string>();
        const shared: string[] = [];
        for (const room of rooms) {
            const trees = changeTrees(room.state as Schema);
            expect(trees.size).toBeGreaterThan(1);
            for (const tree of trees) {
                const prev = owner.get(tree);
                if (prev !== undefined && prev !== room.roomId) shared.push(`${prev} & ${room.roomId}`);
                owner.set(tree, room.roomId);
            }
        }
        // two rooms holding one instance would mean two encoders fighting over its change tracking
        expect(shared).toEqual([]);
        const serializers = [...RecordingSerializer.live];
        expect(serializers.map((s) => s.key).sort()).toEqual(
            ['space', ...gameDriver.gameManager.state.shipIds.map((id) => `ship:${id}`)].sort(),
        );
        // a filtered field would reach the recorder's view-less pseudo-client as nothing
        expect(serializers.map((s) => s.filtered)).not.toContain(true);
    });

    it('writes keyframes, bases and patch segments that rebuild the next keyframe, with no client connected (T2, T3)', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).two_vs_one);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 1000);
        const filename = await recorder.startRecording();
        await new Promise((res) => setTimeout(res, 3300));
        const summary = await recorder.stopRecording();

        const { header, frames, bases, segs } = await readRecording(path.join(tmpDir, filename));
        expect(header).toMatchObject({ version: 2, deltas: 1, patchRateMs: 50, schemaHash: recordingSchemaHash() });
        expect(header.rooms).toEqual(expect.arrayContaining(['space', 'ship:GVTS', 'ship:GVTS2', 'ship:R2D2']));
        expect(frames.length).toBeGreaterThanOrEqual(3);
        expect(summary?.frameCount).toBe(frames.length);
        expect(bases.map((b) => b.t)).toEqual(frames.map((f) => f.t));
        expect(Object.keys(bases[0].base)).toEqual(expect.arrayContaining(header.rooms!));

        for (let k = 0; k + 1 < frames.length; k++) {
            const seg = segs.find((s) => s.t === frames[k].t);
            if (!seg) throw new Error(`no segment for keyframe ${k}`);
            const keyframe = decodeFrameBytes(SavedGame, frames[k].bytes);
            const states = reconstructSegment(keyframe, bases[k].base, seg.bytes);
            // 50 ms patches over a 1 s keyframe interval
            expect(states.length).toBeGreaterThan(10);
            const last = states[states.length - 1];
            expect(frames[k].t + last.dt).toBeCloseTo(frames[k + 1].t, 3);
            const next = decodeFrameBytes(SavedGame, frames[k + 1].bytes);
            expect(diffJson(last.game.fragment.space.toJSON(), next.fragment.space.toJSON())).toEqual([]);
            expect([...last.game.fragment.ship.keys()].sort()).toEqual([...next.fragment.ship.keys()].sort());
            // a ship room's base and patches run up to one patch interval apart from the space room's, so
            // only its discrete fields must match exactly at the keyframe instant
            expect(diffJson(last.game.fragment.ship.toJSON(), next.fragment.ship.toJSON(), Infinity)).toEqual([]);
        }
    }, 20_000);

    it('a corrupt segment fails to reconstruct, so a reader falls back to the keyframe', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).two_vs_one);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 300);
        const filename = await recorder.startRecording();
        await new Promise((res) => setTimeout(res, 700));
        await recorder.stopRecording();
        const { frames, bases, segs } = await readRecording(path.join(tmpDir, filename));
        const keyframe = decodeFrameBytes(SavedGame, frames[0].bytes);
        const seg = segs.find((s) => s.t === frames[0].t)!;
        expect(reconstructSegment(keyframe, bases[0].base, seg.bytes)).not.toHaveLength(0);

        expect(() => reconstructSegment(keyframe, bases[0].base, Buffer.from('not a segment'))).toThrow();
        // a patch addressing a refId the base never had
        const badRef = Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 255, 200, 99, 1, 2]);
        expect(() => reconstructSegment(keyframe, bases[0].base, badRef)).toThrow();
    });

    it('does not record deltas without the flag', async () => {
        gameDriver.pauseGameCommand();
        await gameDriver.gameManager.startGame((await import('../maps')).test_map_1);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 15, () => false);
        const filename = await recorder.startRecording();
        await recorder.stopRecording();
        const { header, frames, bases, segs } = await readRecording(path.join(tmpDir, filename));
        expect(header.deltas).toBeUndefined();
        expect(frames).toHaveLength(1);
        expect(bases).toHaveLength(0);
        expect(segs).toHaveLength(0);
    });

    it('finalizes itself when the game stops, and never appends after that', async () => {
        gameDriver.gameManager.state.speed = 1;
        await gameDriver.gameManager.startGame((await import('../maps')).two_vs_one);
        const recorder = new GameRecorder(gameDriver.gameManager, tmpDir, 100);
        const filename = await recorder.startRecording();
        await new Promise((res) => setTimeout(res, 300));
        await gameDriver.gameManager.stopGame();
        await waitFor(
            () => {
                if (gameDriver.gameManager.state.isRecordingGame) throw new Error('still recording');
            },
            2000,
            20,
        );
        const { frames, bases, segs } = await readRecording(path.join(tmpDir, filename));
        expect(frames.length).toBeGreaterThanOrEqual(2);
        expect(bases).toHaveLength(frames.length);
        expect(segs.length).toBeGreaterThanOrEqual(frames.length - 1);
        const size = (await fs.stat(path.join(tmpDir, filename))).size;
        await new Promise((res) => setTimeout(res, 300));
        expect((await fs.stat(path.join(tmpDir, filename))).size).toBe(size);
        expect(RecordingSerializer.tap).toBeNull();
    });
});
