/**
 * Logs wave runs (`<out>/<scenario>-waves.json`) to MLflow over its REST API: one MLflow run per
 * crew × seed, in experiment `$MLFLOW_EXPERIMENT_NAME` (default `starwards-waves`). Each run is
 * tagged `arm` (crew name), `scenario`, `seed`, `build`, `crew_sha`, `brains`, `batch` and
 * `results_sha`, so arms pair against the guard on `scenario` + `seed`.
 *
 * Called by `cli/waves.ts` when `MLFLOW_TRACKING_URI` is set; `cli/mlflow-log.ts` ingests an
 * existing results file. A results file already logged (same `results_sha`) is skipped. Never
 * throws: a logging failure is printed and the training run goes on.
 */
import { WaveRun } from './wave-compare';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type MlflowLogOptions = {
    resultsFile: string;
    /** Crew name → crew JSON path, for its hash and brains; unresolved crews log without them. */
    crewFiles: Map<string, string>;
    trackingUri?: string;
    experiment?: string;
    /** Overrides `$GIT_COMMIT`, then `git rev-parse HEAD`. */
    build?: string;
};

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex').slice(0, 16);

function buildSha(dir: string) {
    if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
    try {
        return execSync('git rev-parse --short=8 HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return 'unknown';
    }
}

/** `station:<brain file>@<hash>` of every seat with a brain, comma-separated. */
function crewInfo(file: string | undefined) {
    if (!file || !fs.existsSync(file)) return { crew_sha: 'unknown', brains: 'unknown' };
    const text = fs.readFileSync(file);
    const crew = JSON.parse(text.toString()) as { seats?: { station: string; brain?: string }[] };
    const brains = (crew.seats ?? [])
        .filter((s) => s.brain)
        .map((s) => {
            const brain = path.resolve(path.dirname(file), s.brain!);
            return `${s.station}:${path.basename(brain)}@${fs.existsSync(brain) ? sha(fs.readFileSync(brain)) : 'missing'}`;
        });
    return { crew_sha: sha(text), brains: brains.join(',') || 'none' };
}

async function api<T>(uri: string, endpoint: string, body?: object): Promise<T> {
    const res = await fetch(`${uri.replace(/\/$/, '')}/api/2.0/mlflow/${endpoint}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`${endpoint} ${res.status}: ${text}`), { status: res.status, text });
    return JSON.parse(text) as T;
}

async function experimentId(uri: string, name: string) {
    try {
        const r = await api<{ experiment: { experiment_id: string } }>(
            uri,
            `experiments/get-by-name?experiment_name=${encodeURIComponent(name)}`,
        );
        return r.experiment.experiment_id;
    } catch (e) {
        if ((e as { text?: string }).text?.includes('RESOURCE_DOES_NOT_EXIST')) {
            return (await api<{ experiment_id: string }>(uri, 'experiments/create', { name })).experiment_id;
        }
        throw e;
    }
}

export async function logWaveRuns(o: MlflowLogOptions): Promise<number> {
    const uri = o.trackingUri ?? process.env.MLFLOW_TRACKING_URI;
    if (!uri) return 0;
    try {
        const text = fs.readFileSync(o.resultsFile, 'utf8');
        const runs = JSON.parse(text) as WaveRun[];
        const resultsSha = sha(text);
        const scenario = path.basename(o.resultsFile).replace(/-waves\.json$/, '');
        const outDir = path.dirname(path.resolve(o.resultsFile));
        const build = o.build ?? buildSha(path.dirname(o.crewFiles.values().next().value ?? outDir));
        const expId = await experimentId(uri, o.experiment ?? process.env.MLFLOW_EXPERIMENT_NAME ?? 'starwards-waves');
        const done = await api<{ runs?: unknown[] }>(uri, 'runs/search', {
            experiment_ids: [expId],
            filter: `tags.results_sha = '${resultsSha}'`,
            max_results: 1,
        });
        if (done.runs?.length) {
            console.log(`mlflow: ${o.resultsFile} already logged (results_sha ${resultsSha})`);
            return 0;
        }
        const crews = new Map([...new Set(runs.map((r) => r.crew))].map((c) => [c, crewInfo(o.crewFiles.get(c))]));
        for (const r of runs) {
            const passed = r.passed ?? ((r.stationsLost ?? NaN) === 0 && (r.survived ?? 0) >= 3);
            const tags: Record<string, string> = {
                arm: r.crew,
                scenario,
                seed: String(r.seed),
                build,
                ...crews.get(r.crew)!,
                batch: path.basename(outDir),
                out_dir: outDir,
                host: process.env.HOSTNAME ?? process.env.HOST ?? '',
                results_sha: resultsSha,
                'mlflow.runName': `${r.crew}/${scenario}/s${r.seed}`,
            };
            const metrics: Record<string, number | undefined> = {
                passed: Number(passed),
                kills: r.fitness.raidersKilled,
                stationsLost: r.stationsLost,
                survived: r.survived,
                durationSeconds: r.endSeconds,
                wallSeconds: r.wallSeconds,
                holdSeconds: r.fitness.holdSeconds,
                killsPerMinute: r.fitness.killsPerMinute,
                stationCapsuleLost: r.fitness.stationCapsuleLost,
                stationArmorLost: r.fitness.stationArmorLost,
            };
            const now = Date.now();
            const { run } = await api<{ run: { info: { run_id: string } } }>(uri, 'runs/create', {
                experiment_id: expId,
                start_time: now,
                tags: Object.entries(tags).map(([key, value]) => ({ key, value })),
            });
            await api(uri, 'runs/log-batch', {
                run_id: run.info.run_id,
                params: [
                    { key: 'crew', value: r.crew },
                    { key: 'scenario', value: scenario },
                    { key: 'seed', value: String(r.seed) },
                    { key: 'build', value: build },
                ],
                metrics: Object.entries(metrics)
                    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
                    .map(([key, value]) => ({ key, value, timestamp: now, step: 0 })),
            });
            await api(uri, 'runs/update', { run_id: run.info.run_id, status: 'FINISHED', end_time: Date.now() });
        }
        console.log(`mlflow: logged ${runs.length} run(s) of ${o.resultsFile} to ${uri}`);
        return runs.length;
    } catch (e) {
        console.error(`mlflow: logging ${o.resultsFile} failed, results kept on disk: ${(e as Error).message}`);
        return 0;
    }
}
