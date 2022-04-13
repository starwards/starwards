/* eslint-disable no-console */
const path = require('path');
const exec = require('child_process').exec;

const rootPath = path.resolve(__dirname, '..');
function run(cmd) {
    return new Promise((res, rej) => {
        const dockerProc = exec(cmd, { cwd: rootPath });
        dockerProc.stdout.pipe(process.stdout);
        dockerProc.stderr.pipe(process.stderr);
        dockerProc.on('exit', (code) => (code ? rej(new Error(code)) : res()));
    });
}

(async () => {
    try {
        console.log('reinstalling for linux...');
        await run(`docker run --rm -v ${rootPath}:/work/ -w /work/ mcr.microsoft.com/playwright:focal npm ci`);
        console.log('generating snapshots...');
        await run(
            `docker run --rm -v ${rootPath}:/work/ -w /work/ mcr.microsoft.com/playwright:focal npm run test:e2e -- --update-snapshots`
        );
        console.log('done!');
    } catch (e) {
        console.error(e);
    } finally {
        console.log('reinstalling...');
        await run(`npm ci`);
    }
})();
