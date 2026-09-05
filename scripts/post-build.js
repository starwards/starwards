/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const util = require('util');
const globbyPromise = import('globby');
const ncp = util.promisify(require('ncp').ncp);
const { rimraf } = require('rimraf');
const mkdir = util.promisify(fs.mkdir);
const writeFile = util.promisify(fs.writeFile);
const rootPath = path
    .relative(process.cwd(), path.resolve(__dirname, '..'))
    .split(path.sep)
    .filter((e) => !!e)
    .map((e) => e + '/')
    .join('');

const distPath = path.join(rootPath, 'dist');
const staticDistPath = path.join(distPath, 'static');
const serverModulePath = path.join(rootPath, 'modules', 'server');
const coreModulePath = path.join(rootPath, 'modules', 'core');
const browserModulePath = path.join(rootPath, 'modules', 'browser');

async function getPackage(modulePath) {
    const { globby } = await globbyPromise;
    const pattern = path.join(modulePath, 'starwards-*.tgz').split(path.sep).join('/');
    const arr = await globby(pattern);
    if (!arr.length) {
        throw new Error('Package not found: ' + pattern);
    }
    if (arr.length > 1) {
        throw new Error('More than one package found: ' + modulePath + ': ' + arr.join());
    }
    return arr[0];
}
(async () => {
    try {
        const [serverPackage, corePackage] = await Promise.all([
            getPackage(serverModulePath),
            getPackage(coreModulePath),
        ]);
        await rimraf(distPath);
        await mkdir(distPath);
        await mkdir(staticDistPath);
        await ncp(path.join(rootPath, 'static'), staticDistPath);
        await ncp(path.join(browserModulePath, 'dist'), staticDistPath);

        const dependencies = {
            '@starwards/core': 'file:../' + corePackage,
            '@starwards/server': 'file:../' + serverPackage,
        };

        // dist/ installs without a lockfile, so it needs the root's dependency overrides to
        // resolve the same versions npm ci does. Read them rather than restating them.
        const { overrides } = require(path.resolve(rootPath || '.', 'package.json'));

        await writeFile(
            path.join(distPath, 'package.json'),
            JSON.stringify(
                {
                    name: 'starwards',
                    bin: 'node_modules/@starwards/server/cjs/prod.js',
                    scripts: {
                        start: 'node node_modules/@starwards/server/cjs/prod.js',
                    },
                    pkg: {
                        // @msgpackr-extract prebuilds its native addon per-platform, but `npm
                        // install` in scripts/pkg.js only installs the prebuild matching the
                        // build host's os/cpu — so only one platform's .node lands in
                        // dist/node_modules and gets packed. The other target's exe has no
                        // matching prebuild and falls back to msgpackr's pure-JS path at
                        // runtime; that's a perf cost, not a crash.
                        assets: ['static/**/*', 'node_modules/@msgpackr-extract/**/*.node'],
                        targets: ['node24-win-x64', 'node24-linux-x64'],
                    },
                    dependencies,
                    overrides,
                },
                null,
                2,
            ),
        );
    } catch (e) {
        console.error(e);
    }
})();
