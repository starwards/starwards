import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { EVENTS_EXT, RecordedEvent } from './headless-recorder';
import { HeadlessGame, SERVER_TICK_HZ } from './headless-game';
import { T0_PLAY_DEAD_DRAGONFLY, runTraining } from './training/training-scenarios';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT0Map } from '../scenarios/training';
import { parseFrameLine, parseHeader } from '../recording/recording-format';

import { RECORDING_EXT } from '../recording/game-recorder';
import { SavedGame } from '../serialization/game-state-protocol';
import { stringToSchema } from '../serialization/game-state-serialization';

describe('HeadlessRecorder', () => {
    // `runTraining` now always ingests its recording into a store for `analysis/checks.ts`
    // (training-scenarios.ts), which costs more wall time than the bare sim tick loop this test
    // used to wait on.
    it('records a training run whose frames resume into the same trajectory', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-recorder-'));
        const result = await runTraining(T0_PLAY_DEAD_DRAGONFLY, {
            seed: 1,
            timeoutSeconds: 20,
            recording: { dir, intervalSimSeconds: 1 },
        });
        const [headerLine, ...frameLines] = fs
            .readFileSync(result.recording ?? '', 'utf-8')
            .trim()
            .split('\n');
        const header = parseHeader(headerLine);
        expect(header).toMatchObject({ mapName: 'training_t0', seed: 1, params: result.params, hz: SERVER_TICK_HZ });
        const frames = frameLines.map((line) => parseFrameLine(line)!);
        expect(frames.length).toBe(result.frames);

        // isFiring edges land at tick resolution, between 1 s frames, alternating start/stop per mount.
        const events = fs
            .readFileSync(result.recording!.replace(RECORDING_EXT, EVENTS_EXT), 'utf-8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as RecordedEvent);
        const gvtsFire = events.filter(
            (e) => e.kind !== 'blast_hit' && e.objectId === TRAINING_PLAYER_ID && e.mount === 0,
        );
        expect(gvtsFire[0]?.kind).toBe('fire_start');
        gvtsFire.forEach((e, i) => expect(e.kind).toBe(i % 2 ? 'fire_stop' : 'fire_start'));
        expect(events.filter((e) => e.kind === 'blast_hit' && e.objectId === TRAINING_TARGET_ID).length).toBe(
            result.blastHits,
        );
        expect(gvtsFire.some((e) => Math.abs(e.t - Math.round(e.t)) > 1 / SERVER_TICK_HZ / 2)).toBe(true);

        const branch = frames.find((f) => f.t >= 10)!;
        const end = frames.find((f) => f.t >= 12)!;
        const saved = await stringToSchema(SavedGame, branch.frame);
        const expected = await stringToSchema(SavedGame, end.frame);
        const resumed = HeadlessGame.restore(
            saved,
            createTrainingT0Map(header.params as never),
            header.seed ?? 0,
            branch.t,
        );
        while (resumed.seconds + 1e-9 < end.t) {
            resumed.tick(1 / (header.hz ?? SERVER_TICK_HZ));
        }
        // Not bit-exact: automation keeps private per-ship state (flight profile, gunnery latches)
        // that a SavedGame doesn't carry. Kept to 2 s: once blasts land, knock-back amplifies any
        // difference chaotically (seed 1 drifts ~5 m by t=12, ~200 m by t=14 after a volley).
        for (const id of [TRAINING_PLAYER_ID, TRAINING_TARGET_ID]) {
            const actual = resumed.api.getObject(id)!.position;
            const recorded = expected.fragment.space.get(id)!.position;
            expect(Math.hypot(actual.x - recorded.x, actual.y - recorded.y)).toBeLessThan(50);
        }
        // DuckDB's Windows native file handle (the store `runTraining` builds internally) can lag
        // its close callback, longest under full-suite load -- retry, then leave the temp dir to the
        // OS rather than fail a resume test over cleanup.
        for (let attempt = 0; attempt < 20; attempt++) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                break;
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 150));
            }
        }
    }, 60_000);
});
