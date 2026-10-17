/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const util = require('util');
const ncp = util.promisify(require('ncp').ncp);
const { rimraf } = require('rimraf');
const { bundleServer } = require('./bundle-server');

const rootPath = path.resolve(__dirname, '..');
const distPath = path.join(rootPath, 'dist');
const staticDistPath = path.join(distPath, 'static');
const browserModulePath = path.join(rootPath, 'modules', 'browser');

(async () => {
    try {
        await rimraf(distPath);
        await fs.promises.mkdir(staticDistPath, { recursive: true });
        await ncp(path.join(rootPath, 'static'), staticDistPath);
        await ncp(path.join(browserModulePath, 'dist'), staticDistPath);
        // where the bundled @colyseus/monitor looks for its UI, relative to dist/app/starwards.cjs
        await fs.promises.mkdir(path.join(distPath, 'build'), { recursive: true });
        await ncp(
            path.join(path.dirname(require.resolve('@colyseus/monitor')), 'static'),
            path.join(distPath, 'build', 'static'),
        );
        await bundleServer();
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    }
})();
