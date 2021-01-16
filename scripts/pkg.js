/* eslint-disable no-console */
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const pkg = require('pkg');
const rootPath = path.resolve(__dirname, '..');
const distPath = path.join(rootPath, 'dist');
(async () => {
    try {
        const { stdout, stderr } = await exec('npm install --legacy-peer-deps', { cwd: distPath });
        console.error(stderr);
        console.log(stdout);
        await pkg.exec([distPath, '--out-path', distPath]);
        console.log('done!');
    } catch (e) {
        console.error(e);
    }
})();
