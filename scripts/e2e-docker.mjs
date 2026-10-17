// Runs e2e inside the same Playwright image CI uses (modules/e2e/Dockerfile).
// Usage: node scripts/e2e-docker.mjs [--widgets] [playwright args...]
//   --widgets  run the headed Visual Gallery project (test:widgets) under xvfb instead of test:e2e
// Env: E2E_DOCKER_IMAGE (default starwards-e2e) names the image; E2E_DOCKER_CPUS (default 4) caps the container; playwright gets the same worker count,
// since the config's percentage workers count every host core and overload a capped container into timeouts.
// Host rendering (Windows/macOS, other GPUs and fonts) is not the gallery reference; this is.
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// E2E_DOCKER_IMAGE: a distinct tag per worktree, so parallel checkouts don't overwrite each other's image
const image = process.env.E2E_DOCKER_IMAGE ?? 'starwards-e2e';
const cpus = process.env.E2E_DOCKER_CPUS ?? '4';
const args = process.argv.slice(2);
const widgets = args[0] === '--widgets';
const pwArgs = widgets ? args.slice(1) : args;

function run(cmd, cmdArgs) {
    const { status, error } = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit' });
    if (error) throw error;
    if (status !== 0) process.exit(status ?? 1);
}

run('docker', ['build', '-f', 'modules/e2e/Dockerfile', '-t', image, '.']);
mkdirSync(path.join(root, 'test-results'), { recursive: true });
// the image excludes modules/e2e (.dockerignore); tests and snapshot baselines are mounted in
// --init: without a reaping PID 1, xvfb-run's wrapper hangs after playwright exits
run('docker', [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    `--cpus=${cpus}`,
    '-e',
    'CI=true',
    '-v',
    `${path.join(root, 'modules/e2e/test')}:/work/modules/e2e/test`,
    '-v',
    `${path.join(root, 'test-results')}:/work/test-results`,
    image,
    ...(widgets ? ['xvfb-run', '-a', 'npm', 'run', 'test:widgets'] : ['npm', 'run', 'test:e2e']),
    '--',
    `--workers=${cpus}`,
    ...pwArgs,
]);
