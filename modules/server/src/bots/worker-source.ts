import * as path from 'node:path';

/** Set by scripts/bundle-server.js to the bundled worker's code; undefined when running from source or cjs. */
declare const BOT_WORKER_CODE: string | undefined;

let sourceBundle: string | undefined;

/**
 * Bundles worker.ts with esbuild once per process, as scripts/bundle-server.js does for production.
 * Requiring it through ts-node instead re-transpiles the whole module graph in every worker, which
 * takes seconds per worker and many more under CPU load.
 */
function bundleFromSource(): string {
    if (sourceBundle === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- dev-only dependency, needed only from source
        const esbuild = require('esbuild') as typeof import('esbuild');
        const result = esbuild.buildSync({
            entryPoints: [path.join(__dirname, 'worker.ts')],
            tsconfig: path.join(__dirname, '../../tsconfig.json'),
            bundle: true,
            write: false,
            platform: 'node',
            target: 'node24',
            format: 'cjs',
            conditions: ['require', 'node'],
            external: ['msgpackr-extract'],
            logLevel: 'silent',
        });
        sourceBundle = result.outputFiles[0].text;
    }
    return sourceBundle;
}

/** Code for `new Worker(code, { eval: true })`: the bundled worker, built from source, or required from cjs. */
export function botWorkerSource(): string {
    if (typeof BOT_WORKER_CODE === 'string') {
        return BOT_WORKER_CODE;
    }
    if (path.extname(__filename) === '.ts') {
        return bundleFromSource();
    }
    return `require(${JSON.stringify(path.join(__dirname, 'worker.js'))});`;
}
