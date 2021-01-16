/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const ncp = util.promisify(require('ncp').ncp);
const rimraf = util.promisify(require('rimraf'));
const mkdir = util.promisify(fs.mkdir);
const writeFile = util.promisify(fs.writeFile);
const rootPath = path.resolve(__dirname, '..');
const distPath = path.join(rootPath, 'dist');
const staticDistPath = path.join(distPath, 'static');
const serverDistPath = path.join(distPath, 'server');
const serverModulePath = path.join(rootPath, 'modules', 'server');
const modelDistPath = path.join(distPath, 'model');
const modelModulePath = path.join(rootPath, 'modules', 'model');
(async () => {
    try {
        await rimraf(distPath);
        await mkdir(distPath);
        await mkdir(staticDistPath);
        await mkdir(serverDistPath);
        await mkdir(modelDistPath);
        await ncp(path.join(rootPath, 'static'), staticDistPath);
        await ncp(path.join(rootPath, 'modules', 'browser', 'dist'), staticDistPath);
        await ncp(path.join(serverModulePath, 'cjs'), serverDistPath);
        const { stdout, stderr } = await exec('npm pack ' + modelModulePath, { cwd: distPath });
        console.error(stderr);
        console.log(stdout);
        const modulePackageFileName = stdout.trim().split('\n').pop().trim(); // last line is the file name
        const serverDependencies = require(path.join(serverModulePath, 'package.json')).dependencies;
        const modelDependencies = require(path.join(serverModulePath, 'package.json')).dependencies;

        const dependencies = {
            ...modelDependencies,
            ...serverDependencies,
            '@starwards/model': 'file:./' + modulePackageFileName,
        };

        await writeFile(
            path.join(distPath, 'package.json'),
            JSON.stringify(
                {
                    name: 'starwards',
                    bin: 'server/prod.js',
                    scripts: {
                        start: 'node server/prod.js',
                    },
                    pkg: {
                        assets: 'static/**/*',
                        targets: ['node10-win-x64', 'node10-linux-x64', 'node10-osx-x64'],
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
