import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { T0_PLAY_DEAD_DRAGONFLY, runTraining } from './training/training-scenarios';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID, createTrainingT0Map } from '../scenarios/training';
import { parseFrameLine, parseHeader } from '../recording/recording-format';

import { HeadlessGame } from './headless-game';
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
        expect(header).toMatchObject({ mapName: 'training_t0', seed: 1, params: result.params });
        const frames = frameLines.map((line) => parseFrameLine(line)!);
        expect(frames.length).toBe(result.frames);

        const branch = frames.find((f) => f.t >= 10)!;
        const end = frames.find((f) => f.t >= 15)!;
        const saved = await stringToSchema(SavedGame, branch.frame);
        const expected = await stringToSchema(SavedGame, end.frame);
        const resumed = HeadlessGame.restore(
            saved,
            createTrainingT0Map(header.params as never),
            header.seed ?? 0,
            branch.t,
        );
        while (resumed.seconds + 1e-9 < end.t) {
            resumed.tick(0.1);
        }
        // Not bit-exact: automation keeps private per-ship state (flight profile, gunnery latches)
        // that a SavedGame doesn't carry. Measured drift over 5 s from t=10 is ~10 m.
        for (const id of [TRAINING_PLAYER_ID, TRAINING_TARGET_ID]) {
            const actual = resumed.api.getObject(id)!.position;
            const recorded = expected.fragment.space.get(id)!.position;
            expect(Math.hypot(actual.x - recorded.x, actual.y - recorded.y)).toBeLessThan(50);
        }
        // DuckDB's Windows native file handle (the store `runTraining` builds internally) can lag
        // its close callback -- retry a few times rather than fail the test over cleanup.
        for (let attempt = 0; ; attempt++) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                break;
            } catch (err) {
                if (attempt >= 20) {
                    throw err;
                }
                await new Promise((resolve) => setTimeout(resolve, 150));
            }
        }
    }, 30_000);
});
