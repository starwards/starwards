import * as fs from 'fs';
import Module from 'module';

/**
 * Inside a pkg executable, node 24 resolves dual packages (all of `@colyseus/*` 0.18) to their ESM
 * build through the `module-sync` export condition, but node's ESM loader can't read pkg's snapshot
 * filesystem ("Cannot find module …/legacy.mjs"). Redirect those to the `.cjs` file they ship
 * beside it. pkg also transforms ESM-only packages (`rou3`) to CJS and renames their `.mjs` files to
 * `.js`, so a missing `.mjs` falls back to that name. Must load before anything else is required.
 */
type Resolve = (this: unknown, ...args: unknown[]) => string;
const moduleInternals = Module as unknown as { _resolveFilename: Resolve };

if ((process as { pkg?: unknown }).pkg) {
    const resolve = moduleInternals._resolveFilename;
    moduleInternals._resolveFilename = function (this: unknown, ...args: unknown[]) {
        let filename: string;
        try {
            filename = resolve.apply(this, args);
        } catch (e) {
            const missing = /Cannot find module '([^']+)\.mjs'/.exec(e instanceof Error ? e.message : '');
            if (missing && fs.existsSync(missing[1] + '.js')) {
                return missing[1] + '.js';
            }
            throw e;
        }
        if (filename.endsWith('.mjs')) {
            const cjs = filename.slice(0, -'.mjs'.length) + '.cjs';
            if (fs.existsSync(cjs)) {
                return cjs;
            }
        }
        return filename;
    };
}
