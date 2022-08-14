/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const util = require('util');
const globby = require('globby');
const ncp = util.promisify(require('ncp').ncp);
const rimraf = util.promisify(require('rimraf'));
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
                        assets: 'static/**/*',
                        targets: ['node18-win-x64', 'node18-linux-x64', 'node18-osx-x64'],
                    },
                    dependencies,
                },
                null,
                2
            )
        );
    } catch (e) {
        console.error(e);
    }
})();
