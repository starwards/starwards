/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { inject } = require('postject');
const { outfile } = require('./bundle-server');

const rootPath = path.resolve(__dirname, '..');
const distPath = path.join(rootPath, 'dist');
const execPath = path.join(distPath, 'exec');
const seaPath = path.join(distPath, 'sea');
const cachePath = path.join(os.homedir(), '.cache', 'starwards-node');

const MIN_EXECUTABLE_BYTES = 10 * 1024 * 1024;
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
// must match modules/server/src/app-paths.ts
const STATIC_PREFIX = 'static/';
const MONITOR_PREFIX = 'monitor/';

/** Bulky static content the executable leaves out (the Docker image still serves it). Relative to dist/static. */
const EXCLUDED_STATIC = ['models/', 'particles/', 'environment/', 'images/grass.jpg', 'images/screen-capture.webm'];

function collectAssets() {
    const assets = {};
    const add = (prefix, dir) => {
        for (const e of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
            if (!e.isFile()) continue;
            const full = path.join(e.parentPath, e.name);
            const relative = path.relative(dir, full).split(path.sep).join('/');
            if (prefix === STATIC_PREFIX && EXCLUDED_STATIC.some((x) => relative.startsWith(x))) continue;
            assets[prefix + relative] = full;
        }
    };
    add(STATIC_PREFIX, path.join(distPath, 'static'));
    // the monitor serves this directory relative to its entry point (build/index.js)
    add(MONITOR_PREFIX, path.join(path.dirname(require.resolve('@colyseus/monitor')), 'static'));
    return assets;
}

async function download(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

/** A node binary for another platform, matching the running node version, verified against SHASUMS256.txt. */
async function foreignNode(platform) {
    const version = process.version;
    const isWindows = platform === 'win';
    const stem = `node-${version}-${platform}-x64`;
    const name = stem + (isWindows ? '.zip' : '.tar.xz');
    const member = isWindows ? `${stem}/node.exe` : `${stem}/bin/node`;
    const target = path.join(cachePath, `${stem}${isWindows ? '.exe' : '.bin'}`);
    if (fs.existsSync(target)) return target;
    const base = `https://nodejs.org/dist/${version}`;
    const sums = (await download(`${base}/SHASUMS256.txt`)).toString();
    const expected = sums
        .split('\n')
        .find((l) => l.endsWith(' ' + name))
        ?.split(/\s+/)[0];
    if (!expected) throw new Error(`no checksum for ${name}`);
    const archive = await download(`${base}/${name}`);
    if (crypto.createHash('sha256').update(archive).digest('hex') !== expected) {
        throw new Error(`checksum mismatch for ${name}`);
    }
    fs.mkdirSync(cachePath, { recursive: true });
    const archivePath = path.join(cachePath, name);
    fs.writeFileSync(archivePath, archive);
    // GNU tar (linux runners) cannot read zip; unzip is preinstalled there. bsdtar (windows, macos) reads both.
    if (isWindows && process.platform === 'linux') {
        execFileSync('unzip', ['-o', archivePath, member, '-d', cachePath]);
    } else {
        // relative names: GNU tar reads a `C:` drive prefix as a remote host
        execFileSync('tar', ['-xf', name, member], { cwd: cachePath });
    }
    fs.renameSync(path.join(cachePath, ...member.split('/')), target);
    fs.rmSync(path.join(cachePath, stem), { recursive: true, force: true });
    fs.rmSync(archivePath);
    return target;
}

async function main() {
    fs.rmSync(execPath, { recursive: true, force: true });
    fs.rmSync(seaPath, { recursive: true, force: true });
    fs.mkdirSync(execPath, { recursive: true });
    fs.mkdirSync(seaPath, { recursive: true });
    if (!fs.existsSync(outfile)) throw new Error(`${outfile} is missing; run npm run build first`);

    const configPath = path.join(seaPath, 'sea-config.json');
    const blobPath = path.join(seaPath, 'starwards.blob');
    fs.writeFileSync(
        configPath,
        JSON.stringify({
            main: outfile,
            output: blobPath,
            disableExperimentalSEAWarning: true,
            useCodeCache: false,
            useSnapshot: false,
            assets: collectAssets(),
        }),
    );
    execFileSync(process.execPath, ['--experimental-sea-config', configPath], { stdio: 'inherit' });
    const blob = fs.readFileSync(blobPath);

    const targets = [
        { out: 'starwards-linux', platform: 'linux' },
        { out: 'starwards-win.exe', platform: 'win' },
    ];
    for (const t of targets) {
        const isHost = process.platform === (t.platform === 'win' ? 'win32' : 'linux');
        const node = isHost ? process.execPath : await foreignNode(t.platform);
        const dest = path.join(execPath, t.out);
        fs.copyFileSync(node, dest);
        await inject(dest, 'NODE_SEA_BLOB', blob, { sentinelFuse: SEA_FUSE });
        const { size } = fs.statSync(dest);
        if (size < MIN_EXECUTABLE_BYTES) {
            throw new Error(`${dest} is only ${size} bytes, expected at least ${MIN_EXECUTABLE_BYTES}`);
        }
    }
    console.log('done!');
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
