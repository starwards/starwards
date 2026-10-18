// Bundles the headless training CLIs into dist/cli/*.js so worker processes start without ts-node.
// Workspace sources (@starwards/server/src, @starwards/core/src) are bundled; every package, built
// workspace packages included, stays external so schema classes keep one instance. dist/cli sits at
// the depth of src/cli, so __dirname-relative paths (crews, curriculum, training-archive) resolve alike.
import esbuild from 'esbuild';

const entries = ['train', 'branch'];

await esbuild.build({
    entryPoints: entries.map((e) => `src/cli/${e}.ts`),
    outdir: 'dist/cli',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    sourcemap: true,
    logLevel: 'warning',
    plugins: [
        {
            name: 'external-packages',
            setup(build) {
                build.onResolve({ filter: /^[^./]/ }, (args) =>
                    /^@starwards\/(server|core)\/src\//.test(args.path) ? undefined : { external: true },
                );
            },
        },
    ],
});
