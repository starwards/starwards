/**
 * Seats a crew of station brains on a ship of a live Starwards server and plays until Ctrl-C or
 * `--seconds` of game time.
 *
 *   npm --prefix modules/ai run crew -- --url http://localhost:8080 --ship GVTS --crew crews/reference.json [--record] [--seconds N] [--out dir]
 *
 * Decisions land in `<out>/<name>.events.jsonl`. With `--record` the server records the game and
 * `<name>` is the recording's: its `.sgr` is downloaded beside the sidecar, ready for
 * `npm run decisions -- --recording <out>/<name>.sgr` and the server's `analyze`.
 */
import { Driver, EVENTS_EXT, encodeEventLine } from '@starwards/core/internal';

import { applyCacheFlags } from '../brain/jev-cache';
import fs from 'node:fs';
import { liveCrew } from '../live/live-crew';
import { loadCrew } from '../crew/crew-config';
import os from 'node:os';
import path from 'node:path';

const say = (line: string) => process.stdout.write(`${line}\n`);

function arg(name: string, fallback?: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
    applyCacheFlags();
    const baseUrl = new URL(arg('url', 'http://localhost:8080')!);
    const shipId = arg('ship', 'GVTS')!;
    const crewFile = arg('crew');
    if (!crewFile) {
        throw new Error('name the crew file with --crew <path>');
    }
    const record = process.argv.includes('--record');
    const seconds = Number(arg('seconds', 'Infinity'));
    const outDir = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-live-crew'))!);
    fs.mkdirSync(outDir, { recursive: true });

    const crew = loadCrew(path.resolve(crewFile));
    const driver = new Driver(baseUrl).connect();
    try {
        say(`waiting for a game on ${baseUrl.href}`);
        await driver.waitForGame();
        const admin = await driver.getAdminDriver();
        const name = record ? await admin.startRecording() : `${crew.name}-${Date.now()}.sgr`;
        const base = name.replace(/\.sgr$/, '');
        const eventsPath = path.join(outDir, base + EVENTS_EXT);
        fs.writeFileSync(eventsPath, '');
        const live = await liveCrew({
            driver,
            baseUrl,
            shipId,
            seats: crew.seats,
            record,
            write: (event) => fs.appendFileSync(eventsPath, encodeEventLine(event)),
        });
        process.once('SIGINT', () => live.stop());
        say(`${crew.name} seated on ${shipId}${record ? `, recording ${name}` : ''}; Ctrl-C to stop`);
        await live.run((t) => t < seconds);
        say(JSON.stringify({ ...live.stats, jev: crew.jevUsage }));
        if (record) {
            await admin.stopRecording();
            const response = await fetch(new URL(`/recordings/${encodeURIComponent(name)}`, baseUrl));
            if (!response.ok) {
                throw new Error(`can't download ${name} (HTTP ${response.status})`);
            }
            fs.writeFileSync(path.join(outDir, name), await response.text());
            say(`recording: ${path.join(outDir, name)}`);
        }
        say(`decisions: ${eventsPath}`);
    } finally {
        driver.destroy();
    }
}

main().then(
    () => process.exit(0),
    (e: unknown) => {
        process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
        process.exit(1);
    },
);
