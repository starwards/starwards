/* eslint-disable no-console */
const path = require('path');
const esbuild = require('esbuild');

const rootPath = path.resolve(__dirname, '..');
const outfile = path.join(rootPath, 'dist', 'app', 'starwards.cjs');

/** Bundles the server's start-up script and everything it imports into one CommonJS file. */
async function bundleServer() {
    const result = await esbuild.build({
        entryPoints: [path.join(rootPath, 'modules', 'server', 'src', 'prod.ts')],
        tsconfig: path.join(rootPath, 'modules', 'server', 'tsconfig.runtime.json'),
        outfile,
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'cjs',
        conditions: ['require', 'node'],
        // @colyseus/monitor's ESM build locates its UI relative to import.meta.url (0.16) or import.meta.dirname
        // (0.18), which a CommonJS bundle lacks. Resolving either against the bundle puts the UI at
        // dist/build/static (see post-build.js).
        banner: {
            js: "var import_meta_url = require('url').pathToFileURL(__filename).href; var import_meta_dirname = __dirname;",
        },
        define: { 'import.meta.url': 'import_meta_url', 'import.meta.dirname': 'import_meta_dirname' },
        // optional native/peer modules, each loaded inside a try/catch that tolerates their absence
        external: ['msgpackr-extract', '@pm2/io'],
        // server.ts resolves @colyseus/core's Stats.js by path, and only outside a single executable
        logOverride: { 'require-resolve-not-external': 'silent' },
        logLevel: 'warning',
    });
    if (result.warnings.length) {
        throw new Error(`esbuild reported ${result.warnings.length} warning(s)`);
    }
    return outfile;
}

module.exports = { bundleServer, outfile };

if (require.main === module) {
    bundleServer().then(
        (file) => console.log('bundled', file),
        (e) => {
            console.error(e);
            process.exitCode = 1;
        },
    );
}
