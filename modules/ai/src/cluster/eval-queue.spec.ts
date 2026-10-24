import { bundleCrews, evalJobManifest, parseCollected } from './eval-queue';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('bundleCrews', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-queue-'));
    fs.mkdirSync(path.join(dir, 'crews'));
    fs.mkdirSync(path.join(dir, 'gen7'));
    fs.writeFileSync(path.join(dir, 'brain-a.json'), '{"a":1}');
    fs.writeFileSync(path.join(dir, 'gen7', 'brain-b.json'), '{"b":2}');
    const crew = (name: string, brain: string) =>
        JSON.stringify({ name, seats: [{ station: 'captain', policy: 'reference', brain }, { station: 'helms' }] });
    fs.writeFileSync(path.join(dir, 'crews', 'x.json'), crew('x', '../brain-a.json'));
    fs.writeFileSync(path.join(dir, 'crews', 'y.json'), crew('y', '../gen7/brain-b.json'));

    it('ships each crew with its brains, brain paths rewritten into the bundle', () => {
        const b = bundleCrews([path.join(dir, 'crews', 'x.json'), path.join(dir, 'crews', 'y.json')]);
        expect(b.crewPaths).toEqual(['eval/crews/x.json', 'eval/crews/y.json']);
        expect(Object.keys(b.files).sort()).toEqual([
            'brains/brain-a.json',
            'brains/brain-b.json',
            'crews/x.json',
            'crews/y.json',
        ]);
        const y = JSON.parse(b.files['crews/y.json']) as { seats: { brain: string }[] };
        expect(y.seats[0].brain).toBe('../brains/brain-b.json');
        expect(b.files['brains/brain-b.json']).toBe('{"b":2}');
    });

    it('refuses two different brains with one file name', () => {
        fs.writeFileSync(path.join(dir, 'gen7', 'brain-a.json'), '{"other":1}');
        fs.writeFileSync(path.join(dir, 'crews', 'z.json'), crew('z', '../gen7/brain-a.json'));
        expect(() => bundleCrews([path.join(dir, 'crews', 'x.json'), path.join(dir, 'crews', 'z.json')])).toThrow(
            /brain-a\.json/,
        );
    });

    it('refuses two crews with one name', () => {
        expect(() => bundleCrews([path.join(dir, 'crews', 'x.json'), path.join(dir, 'crews', 'x.json')])).toThrow(/x/);
    });
});

describe('evalJobManifest', () => {
    const job = evalJobManifest({
        name: 'eval-abc',
        image: 'ghcr.io/starwards/starwards/training:1234abcd',
        crewPaths: ['eval/crews/x.json', 'eval/crews/y.json'],
        configMap: 'eval-abc-crews',
        files: ['crews/x.json', 'brains/b.json'],
        scenarios: ['W-waves', 'W-cut-lof'],
        firstSeed: 1001,
        seeds: 48,
        runDate: '2026-10-22',
        timeoutSeconds: 1500,
        workers: 4,
    });
    const container = job.spec.template.spec.containers[0];
    const env = Object.fromEntries(container.env.map((e) => [e.name, e.value]));

    it('is an Indexed Job of 16-seed shards', () => {
        expect(job.spec.completionMode).toBe('Indexed');
        expect(job.spec.completions).toBe(3);
        expect(env).toMatchObject({
            JOB: 'waves',
            FIRST_SEED: '1001',
            SEEDS_PER_SHARD: '16',
            SHARDS: '3',
            SCENARIOS: 'W-waves,W-cut-lof',
            CREWS: 'eval/crews/x.json,eval/crews/y.json',
            RUN_DATE: '2026-10-22',
            RUN_NAME: 'eval-abc',
            GIT_COMMIT: '1234abcd',
        });
    });

    it('runs under the training pod rules: priority class, one pod per node, restricted security', () => {
        const spec = job.spec.template.spec;
        expect(spec.priorityClassName).toBe('starwards-training');
        expect(spec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[0].topologyKey).toBe(
            'kubernetes.io/hostname',
        );
        expect(container.securityContext.readOnlyRootFilesystem).toBe(true);
        expect(container.resources.requests).toEqual({ cpu: '500m', memory: '6656Mi' });
    });

    it('mounts the crew bundle under modules/ai/eval', () => {
        expect(container.volumeMounts).toContainEqual({
            name: 'crews',
            mountPath: '/app/modules/ai/eval',
            readOnly: true,
        });
        const crews = job.spec.template.spec.volumes.find((v) => v.name === 'crews');
        expect(crews?.configMap?.items).toEqual([
            { key: 'crews__x.json', path: 'crews/x.json' },
            { key: 'brains__b.json', path: 'brains/b.json' },
        ]);
    });

    it('refuses a seed count that is not whole shards', () => {
        expect(() => evalJobManifest({ ...baseOptions(), seeds: 20 })).toThrow(/16/);
    });
});

describe('parseCollected', () => {
    it('concatenates every shard file per scenario', () => {
        const row = (crew: string, seed: number) => ({ crew, seed });
        const text = [
            '@@@ /a/eval/r/shard-0/W-cut-lof-waves.json',
            JSON.stringify([row('x', 1)]),
            '@@@ /a/eval/r/shard-1/W-cut-lof-waves.json',
            JSON.stringify([row('x', 17)]),
            '@@@ /a/eval/r/shard-0/W-waves-waves.json',
            JSON.stringify([row('y', 1)]),
        ].join('\n');
        const runs = parseCollected(text);
        expect(runs['W-cut-lof'].map((r) => r.seed)).toEqual([1, 17]);
        expect(runs['W-waves']).toHaveLength(1);
    });
});

function baseOptions() {
    return {
        name: 'e',
        image: 'i:t',
        crewPaths: ['a', 'b'],
        configMap: 'c',
        files: [],
        scenarios: ['W-waves'],
        firstSeed: 1,
        seeds: 16,
        runDate: '2026-10-22',
        timeoutSeconds: 480,
        workers: 4,
    };
}
