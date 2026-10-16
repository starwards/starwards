/**
 * Seats a crew of station brains on a ship of a live Starwards server and plays until Ctrl-C or
 * `--seconds` of game time.
 *
 *   npm --prefix modules/ai run crew -- --url http://localhost:8080 --ship GVTS [--crew crews/reference-signals.json] [--human-seat <station>] [--record] [--seconds N] [--out dir]
 *
 * The crew defaults to the rule-based `reference-signals` (no Jev key needed). `--human-seat` leaves
 * that station to a human player and seats the bots on every other station of the crew.
 *
 * Decisions land in `<out>/<name>.events.jsonl`. With `--record` the server records the game and
 * `<name>` is the recording's: its `.sgr` is downloaded beside the sidecar, ready for
 * `npm run decisions -- --recording <out>/<name>.sgr` and the server's `analyze`.
 */
import { Driver, EVENTS_EXT, encodeEventLine } from '@starwards/core/internal';

import { HUMAN_SEATS, loadCrew } from '../crew/crew-config';

import { applyCacheFlags } from '../brain/jev-cache';
import fs from 'node:fs';
import { liveCrew } from '../live/live-crew';
import os from 'node:os';
import path from 'node:path';

const say = (line: string) => process.stdout.write(`${line}\n`);

function arg(name: string, fallback?: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const HELP = `Seats bot crewmates on a ship of a running Starwards game.

Usage (Git Bash, from the repo root):
  npm --prefix modules/ai run crew -- [options]

Options:
  --human-seat <station>  leave this station to a human; bots take every other seat of the crew.
                          One of: ${HUMAN_SEATS.join(', ')}.
                          Default: none, the bots take every seat of the crew.
  --crew <file>           crew file, relative to modules/ai. Default: crews/reference-signals.json
                          (rule-based helms, weapons, engineer, signals; no API key needed).
                          Jev (LLM) crews such as crews/recommended.json need TYPESAFE_API_KEY.
  --url <url>             game server. Default: http://localhost:8080
  --ship <id>             ship to crew. Default: GVTS
  --seconds <n>           stop after n seconds of game time. Default: play until Ctrl-C.
  --record                record the game; the .sgr recording is saved beside the decisions.
  --out <dir>             where decisions (and the recording) are written.
                          Default: <OS temp dir>/starwards-live-crew
  --no-cache              Jev crews only: ask Jev every time instead of reusing saved answers.
  --cache-dir <dir>       Jev crews only: folder of saved Jev answers.
  --help                  this text

The game must already be running: the crew waits for one. Guide: docs/guides/single-seat-playtest.md`;

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        say(HELP);
        return;
    }
    applyCacheFlags();
    const baseUrl = new URL(arg('url', 'http://localhost:8080')!);
    const shipId = arg('ship', 'GVTS')!;
    const crewFile = arg('crew', path.resolve(__dirname, '../../crews/reference-signals.json'))!;
    const humanSeat = arg('human-seat');
    const record = process.argv.includes('--record');
    const seconds = Number(arg('seconds', 'Infinity'));
    const outDir = path.resolve(arg('out', path.join(os.tmpdir(), 'starwards-live-crew'))!);
    fs.mkdirSync(outDir, { recursive: true });

    const crew = loadCrew(path.resolve(crewFile), undefined, humanSeat);
    const driver = new Driver(baseUrl).connect();
    try {
        say(`waiting for a game on ${baseUrl.href} (start one from the lobby or with /start-game)`);
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
        const seated = crew.seats.map((s) => s.station).join(', ');
        const human = humanSeat ? `; ${humanSeat} left to the human` : '';
        say(
            `${crew.name} seated on ${shipId} (${seated})${human}${record ? `, recording ${name}` : ''}; Ctrl-C to stop`,
        );
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
