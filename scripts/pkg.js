/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const pkg = require('@yao-pkg/pkg');
const rootPath = path.resolve(__dirname, '..');
const distPath = path.join(rootPath, 'dist');
const execPath = path.join(distPath, 'exec');

const MIN_EXECUTABLE_BYTES = 10 * 1024 * 1024;
// pkg names outputs by the axes that differ across targets. Both of our
// targets share the same node range and arch, so only the platform suffix
// is appended (see dist/package.json's pkg.targets).
const expectedOutputs = ['starwards-linux', 'starwards-win.exe'];

(async () => {
    try {
        const { stdout, stderr } = await exec('npm install --legacy-peer-deps', { cwd: distPath });
        console.error(stderr);
        console.log(stdout);
        await pkg.exec([distPath, '--out-path', execPath]);
        for (const name of expectedOutputs) {
            const filePath = path.join(execPath, name);
            const { size } = fs.statSync(filePath);
            if (size < MIN_EXECUTABLE_BYTES) {
                throw new Error(`${filePath} is only ${size} bytes, expected at least ${MIN_EXECUTABLE_BYTES}`);
            }
        }
        console.log('done!');
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    }
})();
