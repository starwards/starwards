/* eslint-disable no-console */
// Wait for a fresh core build, build bots over it, then start the dev server.
// Cross-platform twin of wait-for-core.sh (used by the zellij layout);
// `npm run dev` removes stale core output first (see `predev`), so waiting
// for the file to appear is enough to know the initial build finished.
// The server's bot workers load @starwards/bots from its build, so bots
// must be built before the server starts.
const { existsSync } = require('fs');
const { spawn, spawnSync } = require('child_process');
const { join } = require('path');

const projectDir = join(__dirname, '..');
const coreOutput = join(projectDir, 'modules', 'core', 'cjs', 'index.js');

console.log('Waiting for core build...');
const poll = setInterval(() => {
    if (!existsSync(coreOutput)) {
        return;
    }
    clearInterval(poll);
    console.log('Core build ready. Building bots...');
    const bots = spawnSync('npm', ['--prefix', join(projectDir, 'modules', 'bots'), 'run', 'build'], {
        stdio: 'inherit',
        shell: true,
    });
    if (bots.status !== 0) {
        process.exit(bots.status ?? 1);
    }
    console.log('Bots build ready. Starting server...');
    const child = spawn('npm', ['--prefix', join(projectDir, 'modules', 'server'), 'run', 'start'], {
        stdio: 'inherit',
        shell: true,
    });
    child.on('exit', (code) => process.exit(code ?? 0));
}, 500);
