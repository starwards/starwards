import * as path from 'node:path';
import * as sea from 'node:sea';

/** True inside the single-executable build (`scripts/build-exe.js`). */
export const isSingleExecutable = sea.isSea();

/** Asset-key prefixes in the single executable; must match `scripts/build-exe.js`. */
export const SEA_STATIC_PREFIX = 'static/';
export const SEA_MONITOR_PREFIX = 'monitor/';

/**
 * Where a writable default belongs. The single executable keeps its files next to the exe, since
 * the bundle's `__dirname` is not a place the player can find. Everything else keeps `sourceDefault`.
 */
export function writableDefault(
    sourceDefault: string,
    isSea = isSingleExecutable,
    execPath = process.execPath,
): string {
    return isSea ? path.join(path.dirname(execPath), path.basename(sourceDefault)) : sourceDefault;
}
