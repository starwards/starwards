import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { decodeRecording, readRecordingHeader } from './decode';
import { HeadlessGame } from '../../headless-game';
import { HeadlessRecorder } from '../../headless-recorder';
import { training_t0 } from '../../../scenarios/training';

describe('decodeRecording', () => {
    let dir: string;
    let filePath: string;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-analysis-decode-'));
        const game = HeadlessGame.start(training_t0, 1);
        const recorder = new HeadlessRecorder(game, dir, 'fixture', 0.1);
        await recorder.capture();
        game.tick(0.1);
        await recorder.capture();
        game.tick(0.1);
        await recorder.capture();
        filePath = recorder.filePath;
    });

    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('reads the header', async () => {
        const header = await readRecordingHeader(filePath);
        expect(header.format).toBe('starwards-recording');
        expect(header.mapName).toBe('training_t0');
        expect(header.seed).toBe(1);
    });

    it('yields one flattened frame per recorded line, with GVTS and target objects', async () => {
        const frames = [];
        for await (const frame of decodeRecording(filePath)) {
            frames.push(frame);
        }
        expect(frames).toHaveLength(3);
        expect(frames[0].t).toBeCloseTo(0, 5);
        expect(frames[1].t).toBeCloseTo(0.1, 5);
        expect(frames[2].t).toBeCloseTo(0.2, 5);

        const objectIds = frames[0].objects.map((o) => o.objectId).sort();
        expect(objectIds).toEqual(['GVTS', 'target']);

        const gvtsPositionX = frames[0].values.find((v) => v.objectId === 'GVTS' && v.path === '/position/x');
        expect(gvtsPositionX).toBeDefined();
        expect(typeof gvtsPositionX?.num).toBe('number');
    });

    it('drops a truncated tail line instead of throwing', async () => {
        const truncatedPath = path.join(dir, 'truncated.swr.jsonl');
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
        // header + first two frames intact, third frame line cut mid-way through.
        const cut = lines[3].slice(0, Math.floor(lines[3].length / 2));
        fs.writeFileSync(truncatedPath, [...lines.slice(0, 3), cut].join('\n') + '\n');

        const frames = [];
        for await (const frame of decodeRecording(truncatedPath)) {
            frames.push(frame);
        }
        expect(frames).toHaveLength(2);
    });
});
