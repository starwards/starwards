const path = require('path');
const fs = require('fs');
const util = require('util');
const ncp = util.promisify(require('ncp').ncp);
const rimraf = util.promisify(require('rimraf'));
const pkg = require('pkg');
const mkdir = util.promisify(fs.mkdir);
const exec = util.promisify(require('child_process').exec);
const writeFile = util.promisify(fs.writeFile);

const rootPath = path.resolve(__dirname, '..');
const distPath = path.join(rootPath, 'dist');
const staticDistPath = path.join(distPath, 'static');
const codeDistPath = path.join(distPath, 'code');
const serverModulePath = path.join(rootPath, 'modules', 'server');
(async () => {
    try {
        await rimraf(distPath);
        await mkdir(distPath);
        await mkdir(staticDistPath);
        await mkdir(codeDistPath);
        await ncp(path.join(rootPath, 'static'), staticDistPath);
        await ncp(path.join(rootPath, 'modules', 'browser', 'dist'), staticDistPath);
        await ncp(path.join(serverModulePath, 'cjs'), codeDistPath);
        const dependencies = require(path.join(serverModulePath, 'package.json')).dependencies;

        // todo: generify
        dependencies['@starwards/model'] = path.join(rootPath, 'modules', 'model');

        await writeFile(
            path.join(distPath, 'package.json'),
            JSON.stringify(
                {
                    name: 'starwards',
                    bin: 'code/prod.js',
                    scripts: {
                        start: 'node code/prod.js',
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
        const { stdout, stderr } = await exec('yarn', { cwd: distPath });
        console.error(stderr);
        console.log(stdout);
        await pkg.exec([distPath, '--out-path', distPath]);
        console.log('done!');
    } catch (e) {
        console.error(e);
    }
})();
