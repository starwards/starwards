/**
 * Paired eval queue on the K3S training cluster: "crew files × seed range × scenarios" as one Indexed
 * Job of 16-seed shards (`JOB=waves` in docker/training/run-job.sh). Every shard plays every crew on
 * the same seeds, so collected rows pair by seed. The crews and their brains travel in a ConfigMap
 * owned by the Job, so candidate crews need no image rebuild. Concurrency is the cluster's: one
 * training pod per node, shared with the scheduled jobs; extra shards wait (`FailedCreate` on quota).
 *
 *   const { job } = submit({ crews: ['crews/a.json', 'gen3/c17.json'], scenarios: ['W-waves'], firstSeed: 1, seeds: 64 });
 *   const { runs, pending, failed } = collect([job], { wait: true });   // runs['W-waves']: WaveRun[]
 *
 * CLI: `npm --prefix modules/ai run eval-queue -- submit|status|collect ...` (cli/eval-queue.ts).
 */
import { WaveRun } from '../training/wave-compare';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SHARD_SEEDS = 16;
export const NAMESPACE = 'starwards-training';
/** Built from branch waves-eval: run-job.sh with JOB=waves, waves rows with stationsLost/survived. */
export const DEFAULT_IMAGE = 'ghcr.io/starwards/starwards/training:ee970719';

type CrewFile = { name: string; seats: { brain?: string }[] };

/** Crew files and the brains they name, laid out as `crews/<file>` and `brains/<file>` for the ConfigMap. */
export function bundleCrews(crewFiles: readonly string[]) {
    const files: Record<string, string> = {};
    const names = new Set<string>();
    const crewPaths = crewFiles.map((file) => {
        const crew = JSON.parse(fs.readFileSync(file, 'utf8')) as CrewFile;
        if (names.has(crew.name)) throw new Error(`two crews are named ${crew.name}`);
        names.add(crew.name);
        for (const seat of crew.seats) {
            if (!seat.brain) continue;
            const base = path.basename(seat.brain);
            const text = fs.readFileSync(path.resolve(path.dirname(file), seat.brain), 'utf8');
            const key = `brains/${base}`;
            if (files[key] !== undefined && files[key] !== text)
                throw new Error(`two different brains are named ${base}`);
            files[key] = text;
            seat.brain = `../brains/${base}`;
        }
        const key = `crews/${path.basename(file)}`;
        files[key] = JSON.stringify(crew, null, 4);
        return `eval/${key}`;
    });
    return { crewPaths, files };
}

const configMapKey = (file: string) => file.replace('/', '__');

export type EvalJobOptions = {
    name: string;
    image: string;
    crewPaths: readonly string[];
    configMap: string;
    files: readonly string[];
    scenarios: readonly string[];
    firstSeed: number;
    seeds: number;
    runDate: string;
    timeoutSeconds: number;
    workers: number;
};

export function evalJobManifest(o: EvalJobOptions) {
    if (o.seeds <= 0 || o.seeds % SHARD_SEEDS)
        throw new Error(`seeds must be whole ${SHARD_SEEDS}-seed shards: ${o.seeds}`);
    const shards = o.seeds / SHARD_SEEDS;
    const labels = { 'app.kubernetes.io/name': 'starwards-training', role: 'eval' };
    const env = {
        JOB: 'waves',
        RUN_DATE: o.runDate,
        RUN_NAME: o.name,
        SCENARIOS: o.scenarios.join(','),
        CREWS: o.crewPaths.join(','),
        WORKERS: String(o.workers),
        TIMEOUT: String(o.timeoutSeconds),
        FIRST_SEED: String(o.firstSeed),
        SEEDS_PER_SHARD: String(SHARD_SEEDS),
        SHARDS: String(shards),
        GIT_COMMIT: o.image.split(':').pop()!,
    };
    return {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: o.name, namespace: NAMESPACE, labels },
        spec: {
            completionMode: 'Indexed',
            completions: shards,
            parallelism: shards,
            backoffLimitPerIndex: 1,
            ttlSecondsAfterFinished: 604800,
            template: {
                metadata: { labels: { ...labels, 'starwards/job': 'eval' } },
                spec: {
                    priorityClassName: 'starwards-training',
                    restartPolicy: 'Never',
                    affinity: {
                        podAntiAffinity: {
                            requiredDuringSchedulingIgnoredDuringExecution: [
                                {
                                    labelSelector: { matchLabels: { 'app.kubernetes.io/name': 'starwards-training' } },
                                    topologyKey: 'kubernetes.io/hostname',
                                },
                            ],
                        },
                    },
                    securityContext: {
                        fsGroup: 1000,
                        runAsGroup: 1000,
                        runAsNonRoot: true,
                        runAsUser: 1000,
                        seccompProfile: { type: 'RuntimeDefault' },
                    },
                    containers: [
                        {
                            name: 'train',
                            image: o.image,
                            env: Object.entries(env).map(([name, value]) => ({ name, value })),
                            resources: { requests: { cpu: '500m', memory: '6656Mi' }, limits: { memory: '6656Mi' } },
                            securityContext: {
                                allowPrivilegeEscalation: false,
                                capabilities: { drop: ['ALL'] },
                                readOnlyRootFilesystem: true,
                            },
                            volumeMounts: [
                                { name: 'archive', mountPath: '/training-archive' },
                                { name: 'tmp', mountPath: '/tmp' },
                                { name: 'crews', mountPath: '/app/modules/ai/eval', readOnly: true },
                            ],
                        },
                    ],
                    volumes: [
                        { name: 'archive', persistentVolumeClaim: { claimName: 'training-archive' } },
                        { name: 'tmp', emptyDir: {} },
                        {
                            name: 'crews',
                            configMap: {
                                name: o.configMap,
                                items: o.files.map((f) => ({ key: configMapKey(f), path: f })),
                            },
                        },
                    ],
                },
            },
        },
    };
}

/** `@@@ <path>` headed JSON arrays (the archive reader's dump), rows concatenated per scenario. */
export function parseCollected(text: string): Record<string, WaveRun[]> {
    const runs: Record<string, WaveRun[]> = {};
    for (const chunk of text.split(/^@@@ /m).slice(1)) {
        const newline = chunk.indexOf('\n');
        const scenario = path.basename(chunk.slice(0, newline).trim()).replace(/-waves\.json$/, '');
        (runs[scenario] ??= []).push(...(JSON.parse(chunk.slice(newline + 1)) as WaveRun[]));
    }
    return runs;
}

function kubeconfig() {
    const own = path.join(os.homedir(), '.kube', 'starwards-training-config');
    return process.env.KUBECONFIG ?? (fs.existsSync(own) ? own : undefined);
}

function kubectl(args: readonly string[], input?: string) {
    const config = kubeconfig();
    return execFileSync('kubectl', [...(config ? ['--kubeconfig', config] : []), '-n', NAMESPACE, ...args], {
        input,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    });
}

export type SubmitOptions = {
    /** Local crew files; their brains ship with them. */
    crews: readonly string[];
    scenarios: readonly string[];
    firstSeed: number;
    /** A multiple of 16. */
    seeds: number;
    /** Job name prefix (default `eval`). */
    label?: string;
    image?: string;
    timeoutSeconds?: number;
    workers?: number;
};

/** Creates the crews' ConfigMap and the Indexed Job; returns the Job name, the handle `collect` takes. */
export function submit(o: SubmitOptions): { job: string } {
    if (o.crews.length < 2) throw new Error('a paired eval needs at least two crews');
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
    const name = `${(o.label ?? 'eval')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 30)}-${stamp}`;
    const { crewPaths, files } = bundleCrews(o.crews);
    const configMap = `${name}-crews`;
    kubectl(
        ['apply', '-f', '-'],
        JSON.stringify({
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: { name: configMap, namespace: NAMESPACE, labels: { role: 'eval' } },
            data: Object.fromEntries(Object.entries(files).map(([f, text]) => [configMapKey(f), text])),
        }),
    );
    const job = evalJobManifest({
        name,
        image: o.image ?? process.env.EVAL_IMAGE ?? DEFAULT_IMAGE,
        crewPaths,
        configMap,
        files: Object.keys(files),
        scenarios: o.scenarios,
        firstSeed: o.firstSeed,
        seeds: o.seeds,
        runDate: new Date().toISOString().slice(0, 10),
        timeoutSeconds: o.timeoutSeconds ?? (o.scenarios.includes('W-waves') ? 1500 : 480),
        workers: o.workers ?? 4,
    });
    kubectl(['create', '-f', '-'], JSON.stringify(job));
    const uid = kubectl(['get', 'job', name, '-o', 'jsonpath={.metadata.uid}']).trim();
    const owner = { apiVersion: 'batch/v1', kind: 'Job', name, uid };
    kubectl([
        'patch',
        'configmap',
        configMap,
        '--type',
        'merge',
        '-p',
        JSON.stringify({ metadata: { ownerReferences: [owner] } }),
    ]);
    return { job: name };
}

type JobJson = {
    spec: { completions: number; template: { spec: { containers: { env: { name: string; value: string }[] }[] } } };
    status: { succeeded?: number; failed?: number; active?: number; completedIndexes?: string; failedIndexes?: string };
};

export type JobStatus = {
    job: string;
    runDate: string;
    shards: number;
    succeeded: number;
    failed: number;
    active: number;
    finished: boolean;
};

export function status(job: string): JobStatus {
    const j = JSON.parse(kubectl(['get', 'job', job, '-o', 'json'])) as JobJson;
    const env = Object.fromEntries(j.spec.template.spec.containers[0].env.map((e) => [e.name, e.value]));
    const succeeded = j.status.succeeded ?? 0;
    const failed = j.status.failed ?? 0;
    const shards = j.spec.completions;
    // a failed index stays failed (backoffLimitPerIndex): finished once every index has an outcome
    const failedIndexes = (j.status.failedIndexes ?? '').split(',').filter(Boolean).length;
    return {
        job,
        runDate: env.RUN_DATE,
        shards,
        succeeded,
        failed,
        active: j.status.active ?? 0,
        finished: succeeded + failedIndexes >= shards,
    };
}

/**
 * The jobs' rows per scenario, read from the archive (deploy/archive-reader). `wait` polls every
 * `pollSeconds` until every job finished. Rows of a shard that did not finish are absent: `pending`
 * and `failed` name those jobs.
 */
export function collect(jobs: readonly string[], { wait = false, pollSeconds = 60 } = {}) {
    let states = jobs.map(status);
    while (wait && states.some((s) => !s.finished)) {
        execFileSync(process.execPath, ['-e', `setTimeout(() => {}, ${pollSeconds * 1000})`]);
        states = jobs.map(status);
    }
    const runs: Record<string, WaveRun[]> = {};
    for (const s of states) {
        const dir = `/training-archive/${s.runDate}/eval/${s.job}`;
        const text = kubectl([
            'exec',
            'deploy/archive-reader',
            '-c',
            'reader',
            '--',
            'sh',
            '-c',
            `for f in ${dir}/shard-*/*-waves.json; do [ -f "$f" ] && [ -f "$(dirname "$f")/done" ] && { echo "@@@ $f"; cat "$f"; echo; }; done; true`,
        ]);
        for (const [scenario, rows] of Object.entries(parseCollected(text))) (runs[scenario] ??= []).push(...rows);
    }
    return {
        runs,
        pending: states.filter((s) => !s.finished).map((s) => s.job),
        failed: states.filter((s) => s.failed > 0).map((s) => s.job),
    };
}
