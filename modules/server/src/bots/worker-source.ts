import * as path from 'node:path';

/** Set by scripts/bundle-server.js to the bundled worker's code; undefined when running from source or cjs. */
declare const BOT_WORKER_CODE: string | undefined;

/**
 * Resolves `@starwards/*` to package sources (mirroring jest's moduleNameMapper),
 * so a worker started from source runs without built packages.
 */
function sourceResolver(modulesDir: string): string {
    return `{
const Module = require('node:module');
const path = require('node:path');
const modulesDir = ${JSON.stringify(modulesDir)};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request.startsWith('@starwards/')) {
        const [pkg, ...sub] = request.slice('@starwards/'.length).split('/');
        request = path.join(modulesDir, pkg, sub.join('/') === 'internal' ? 'src/index.internal' : sub.join('/') || 'src');
    }
    return resolve.call(this, request, ...rest);
};
}`;
}

/** Code for `new Worker(code, { eval: true })`: the bundled worker, or a bootstrap that requires it from disk. */
export function botWorkerSource(): string {
    if (typeof BOT_WORKER_CODE === 'string') {
        return BOT_WORKER_CODE;
    }
    const fromSource = path.extname(__filename) === '.ts';
    const entry = path.join(__dirname, fromSource ? 'worker.ts' : 'worker.js');
    const preload = fromSource
        ? `require(${JSON.stringify(require.resolve('ts-node/register/transpile-only'))});` +
          sourceResolver(path.resolve(__dirname, '../../..'))
        : '';
    return `${preload}require(${JSON.stringify(entry)});`;
}
