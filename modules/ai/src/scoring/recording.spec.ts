import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';
import { HeadlessRecorder } from '@starwards/server/src/test/headless-recorder';
import { readFrames } from './recording';
import { training_t0 } from '@starwards/server/src/scenarios/training';
import { writeV2Fixture } from '@starwards/server/src/test/v2-recording-fixture';

describe('readFrames', () => {
    let dir: string;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-ai-recording-'));
    });

    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('reads a format-v2 file (delta lines, truncated tail) as exactly its keyframes', async () => {
        const game = HeadlessGame.start(training_t0, 1);
        const recorder = new HeadlessRecorder(game, dir, 'fixture', 0.1);
        await recorder.capture();
        game.tick(0.1);
        await recorder.capture();
        const v2Path = path.join(dir, 'v2.sgr');
        writeV2Fixture(recorder.filePath, v2Path, { truncateTail: true });

        const v1 = await readFrames(recorder.filePath);
        const v2 = await readFrames(v2Path);
        expect(v2.map((f) => f.t)).toEqual(v1.map((f) => f.t));
        expect(v2.map((f) => f.saved.toJSON())).toEqual(v1.map((f) => f.saved.toJSON()));
        expect(v2).toHaveLength(2);
    });
});
