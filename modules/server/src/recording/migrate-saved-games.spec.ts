import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { MapSchema, Schema } from '@colyseus/schema';
import { gameField, isBinarySavedGame } from '@starwards/core/internal';
import { savedGameToSchema, schemaToString } from '../serialization/game-state-serialization';
import { migrateSavedGames } from './migrate-saved-games';

class TestMapSchema extends Schema {
    @gameField({ map: 'number' })
    value = new MapSchema<number>();
}

describe('migrateSavedGames', () => {
    let dir: string;
    const textFile = () => path.join(dir, 'sub', 'a.ssg');
    let source: TestMapSchema;
    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssg-migrate-'));
        fs.mkdirSync(path.join(dir, 'sub'));
        source = new TestMapSchema();
        for (let i = 0; i < 500; i++) source.value.set(`k${i}`, i);
        fs.writeFileSync(textFile(), await schemaToString(source));
        fs.writeFileSync(path.join(dir, 'sub', 'notes.txt'), 'leave me');
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('converts in place to the same game in a smaller file, leaving other files alone', async () => {
        const size = fs.statSync(textFile()).size;
        const report = await migrateSavedGames(dir, {});
        const file = fs.readFileSync(textFile());
        expect(isBinarySavedGame(file)).toBe(true);
        expect(file.length).toBeLessThan(size);
        expect((await savedGameToSchema(TestMapSchema, file)).toJSON()).toEqual(source.toJSON());
        expect(report).toMatchObject({ converted: 1, skipped: 0, failed: 0, bytesBefore: size });
        expect(fs.readFileSync(path.join(dir, 'sub', 'notes.txt'), 'utf8')).toBe('leave me');
    });

    it('is idempotent: a converted file is skipped and left untouched', async () => {
        await migrateSavedGames(dir, {});
        const bytes = fs.readFileSync(textFile());
        expect(await migrateSavedGames(dir, {})).toMatchObject({ converted: 0, skipped: 1 });
        expect(fs.readFileSync(textFile())).toEqual(bytes);
    });

    it('--dry-run reports the saving and writes nothing', async () => {
        const bytes = fs.readFileSync(textFile());
        const report = await migrateSavedGames(dir, { dryRun: true });
        expect(report.converted).toBe(1);
        expect(report.bytesAfter).toBeLessThan(report.bytesBefore);
        expect(fs.readFileSync(textFile())).toEqual(bytes);
    });

    it('--out writes the converted tree elsewhere and keeps the originals', async () => {
        const out = path.join(dir, 'out');
        const bytes = fs.readFileSync(textFile());
        await migrateSavedGames(path.join(dir, 'sub'), { outDir: out });
        expect(fs.readFileSync(textFile())).toEqual(bytes);
        expect(isBinarySavedGame(fs.readFileSync(path.join(out, 'a.ssg')))).toBe(true);
    });

    it('fails a corrupt file and leaves it in place, with no temp file behind', async () => {
        fs.writeFileSync(textFile(), 'not a saved game');
        const report = await migrateSavedGames(dir, {});
        expect(report).toMatchObject({ converted: 0, failed: 1 });
        expect(fs.readFileSync(textFile(), 'utf8')).toBe('not a saved game');
        expect(fs.readdirSync(path.join(dir, 'sub')).sort()).toEqual(['a.ssg', 'notes.txt']);
    });
});
