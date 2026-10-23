import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import { isSidecarName } from '@starwards/core/internal';
import os from 'node:os';
import path from 'node:path';
import { readSidecar } from '@starwards/server/src/recording/sidecar-file';
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
        .filter(isSidecarName)
        .sort()
        .map((f) => readSidecar(path.join(crewDir, f)));
    return { results, events };
}

describe('bundled training CLI', () => {
    jest.setTimeout(300_000);
    let dir: string;
    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-bundle-'));
        // the bundle loads core and bots from their built cjs/ (build-cli.mjs keeps packages external)
        for (const [pkg, entry] of [
            ['core', 'cjs/index.internal.js'],
            ['bots', 'cjs/index.js'],
        ]) {
            const pkgDir = path.resolve(moduleDir, '..', pkg);
            if (!fs.existsSync(path.join(pkgDir, entry))) {
                execSync('npm run build', { cwd: pkgDir, stdio: 'ignore' });
            }
        }
        execFileSync(process.execPath, ['build-cli.mjs'], { cwd: moduleDir });
    });
    afterAll(() => rmDirRetrying(dir));

    const opts = { cwd: moduleDir, stdio: 'ignore' as const };
    const tsNode = (cli: string, args: string[]) =>
        execFileSync(process.execPath, ['-r', 'ts-node/register/transpile-only', `src/cli/${cli}.ts`, ...args], opts);
    const bundled = (cli: string, args: string[]) =>
        execFileSync(process.execPath, [`dist/cli/${cli}.js`, ...args], opts);

    it('plays the same runs as the ts-node CLI', () => {
        const fromSource = path.join(dir, 'source');
        const fromBundle = path.join(dir, 'bundle');
        tsNode('train', [...trainArgsCrew, '--out', fromSource]);
        bundled('train', [...trainArgsCrew, '--out', fromBundle]);
        const expected = outcome(fromSource);
        expect(expected.events.length).toBe(2);
        expect(outcome(fromBundle)).toEqual(expected);
    });

    it('branches the same corpus as the ts-node CLI', () => {
        const runs = path.join(dir, 'source');
        const corpus = (out: string) =>
            fs.readFileSync(path.join(out, 'branches.jsonl'), 'utf8').split('\n').filter(Boolean).sort();
        const args = (out: string) => [
            'corpus',
            '--runs',
            runs,
            '--crew',
            'crews/captain-reference.json',
            '--scenario',
            'T3-directed',
            '--budget',
            '4',
            '--workers',
            '2',
            '--out',
            out,
        ];
        tsNode('branch', args(path.join(dir, 'corpus-source')));
        bundled('branch', args(path.join(dir, 'corpus-bundle')));
        const expected = corpus(path.join(dir, 'corpus-source'));
        expect(expected.length).toBeGreaterThan(0);
        expect(corpus(path.join(dir, 'corpus-bundle'))).toEqual(expected);
    });
});
