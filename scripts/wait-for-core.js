/* eslint-disable no-console */
// Wait for a fresh core build, then start the dev server.
// Cross-platform twin of wait-for-core.sh (used by the zellij layout);
// `npm run dev` removes stale core output first (see `predev`), so waiting
// for the file to appear is enough to know the initial build finished.
const { existsSync } = require('fs');
const { spawn } = require('child_process');
const { join } = require('path');

const projectDir = join(__dirname, '..');
const coreOutput = join(projectDir, 'modules', 'core', 'cjs', 'index.js');

console.log('Waiting for core build...');
const poll = setInterval(() => {
    if (!existsSync(coreOutput)) {
        return;
    }
    clearInterval(poll);
    console.log('Core build ready. Starting server...');
    const child = spawn('npm', ['--prefix', join(projectDir, 'modules', 'server'), 'run', 'start'], {
        stdio: 'inherit',
        shell: true,
    });
    child.on('exit', (code) => process.exit(code ?? 0));
}, 500);
