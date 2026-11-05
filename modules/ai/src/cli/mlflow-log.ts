/**
 * Logs an existing results file to MLflow (`training/mlflow-log.ts`); skips it if already logged.
 *
 *   MLFLOW_TRACKING_URI=https://mlflow.home.arad.ad npm --prefix modules/ai run mlflow-log -- <out>/<scenario>-waves.json [--crews crews] [--build <sha>] [--experiment <name>] [--tag key=value]...
 *
 * Crews resolve to `<crews>/<crew>.json` (default `crews/`) for their hash and brains.
 */
import { WaveRun } from '../training/wave-compare';
import fs from 'node:fs';
import { logWaveRuns } from '../training/mlflow-log';
import path from 'node:path';

const flag = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const resultsFile = process.argv[2];
if (!resultsFile || !process.env.MLFLOW_TRACKING_URI) {
    throw new Error(
        'usage: MLFLOW_TRACKING_URI=<uri> mlflow-log <out>/<scenario>-waves.json [--crews <dir>] [--build <sha>]',
    );
}
const crewsDir = path.resolve(flag('crews') ?? 'crews');
const runs = JSON.parse(fs.readFileSync(resultsFile, 'utf8')) as WaveRun[];
void logWaveRuns({
    resultsFile,
    crewFiles: new Map(runs.map((r) => [r.crew, path.join(crewsDir, `${r.crew.split('#')[0]}.json`)])),
    build: flag('build'),
    experiment: flag('experiment'),
    tags: Object.fromEntries(
        process.argv.flatMap((a, i) => {
            if (a !== '--tag') return [];
            const [key, ...value] = process.argv[i + 1].split('=');
            return [[key, value.join('=')] as const];
        }),
    ),
});
