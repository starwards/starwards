import * as path from 'node:path';

/** Set by scripts/bundle-server.js to the bundled worker's code; undefined when running from source or cjs. */
declare const BOT_WORKER_CODE: string | undefined;

/** Code for `new Worker(code, { eval: true })`: the bundled worker, or a bootstrap that requires it from disk. */
export function botWorkerSource(): string {
    if (typeof BOT_WORKER_CODE === 'string') {
        return BOT_WORKER_CODE;
    }
    const fromSource = path.extname(__filename) === '.ts';
    const entry = path.join(__dirname, fromSource ? 'worker.ts' : 'worker.js');
    const preload = fromSource ? `require(${JSON.stringify(require.resolve('ts-node/register/transpile-only'))});` : '';
    return `${preload}require(${JSON.stringify(entry)});`;
}
