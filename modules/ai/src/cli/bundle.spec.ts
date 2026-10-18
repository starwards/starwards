import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rmDirRetrying } from '@starwards/server/src/test/training/analysis/__fixtures__/rm-retry';

const moduleDir = path.resolve(__dirname, '../..');
const trainArgs = ['--scenario', 'T3-directed', '--seeds', '2', '--workers', '2', '--timeout', '60'];
const trainArgsCrew = [...trainArgs, '--crew', 'crews/captain-reference.json'];

/** Run results without wall-clock fields, and every decision log, of a `train` output directory. */
function outcome(dir: string) {
    const results = JSON.parse(fs.readFileSync(path.join(dir, 'T3-directed-crews.json'), 'utf8'), (k, v: unknown) =>
        k === 'wallSeconds' || k === 'recording' ? undefined : v,
    ) as unknown;
    const crewDir = path.join(dir, 'captain-reference');
    const events = fs
        .readdirSync(crewDir)
        .filter((f) => f.endsWith('.events.jsonl'))
        .sort()
        .map((f) => fs.readFileSync(path.join(crewDir, f), 'utf8'));
    return { results, events };
}

describe('bundled training CLI', () => {
    jest.setTimeout(300_000);
    let dir: string;
    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-bundle-'));
        execFileSync(process.execPath, ['build-cli.mjs'], { cwd: moduleDir });
    });
    afterAll(() => rmDirRetrying(dir));

    it('plays the same runs as the ts-node CLI', () => {
        const fromSource = path.join(dir, 'source');
        const fromBundle = path.join(dir, 'bundle');
        const opts = { cwd: moduleDir, stdio: 'ignore' as const };
        execFileSync(
            process.execPath,
            ['-r', 'ts-node/register/transpile-only', 'src/cli/train.ts', ...trainArgsCrew, '--out', fromSource],
            opts,
        );
        execFileSync(process.execPath, ['dist/cli/train.js', ...trainArgsCrew, '--out', fromBundle], opts);
        const expected = outcome(fromSource);
        expect(expected.events.length).toBe(2);
        expect(outcome(fromBundle)).toEqual(expected);
    });
});
