# GM Bot Seats

Spec: [`docs/superpowers/specs/2026-10-17-gm-bot-seats-design.md`](../superpowers/specs/2026-10-17-gm-bot-seats-design.md).

## Goal

The GM seats a server-run `reference` bot on any bridge seat of any player ship from the station roster, and its decisions are recorded beside the game recording.

## Architecture

```
core  (seat table, AdminState.bots, assignBot)
  ^
bots  (@starwards/bots: brain stack, reference crew + v1 brains, station-session layer)
  ^            ^              ^
server       mcp             ai
  GameManager --assign--> BotSupervisor --one worker_threads Worker per ship-->
     worker.ts: Driver(localhost) + shipCrew (dynamic seats, record toggle)
        --postMessage {status|event|log}--> BotSupervisor --> AdminState.bots / GameRecorder.appendEvent
```

- `GameManager` drains `assignBotCommands` (enqueue+drain, like `assignStationCommands`), owns `AdminState.bots`, and calls a `BotSeats` interface. `server()` installs a `BotSupervisor` (the worker registry) as that interface.
- The worker source is (a) a `require` bootstrap of `src/bots/worker.ts` through ts-node in dev, jest and Playwright (all run the server from source — see `modules/e2e/test/driver.ts:5,38`), (b) `worker.js` under `cjs/`, or (c) a string the esbuild bundle embeds via `define` (`BOT_WORKER_CODE`), started with `new Worker(code, { eval: true })` — the only form that works in the SEA build, which has no files on disk.
- The sidecar is written by `GameRecorder`, stamped on its own clock (`manager.totalSeconds - baseSeconds`). The worker only gates posting on a `record` flag the supervisor flips from `isRecordingGame`.

## Tech Stack

TypeScript 6, Node 24 `worker_threads`, Colyseus 0.18 (`@colyseus/schema` 5), esbuild 0.28 (`scripts/bundle-server.js`), Node SEA (`scripts/build-exe.js`), jQuery widget (browser), Jest 30 + ts-jest, Playwright, turbo, knip, zod 4.

## Conventions for every task

- Worktree: `C:/workspace/helios/starwards-wt-bot-seats` (branch `bot-seats`). Run commands from its root in Git Bash.
- TDD: write the test, run it, see it fail for the stated reason, implement, see it pass.
- One task = one commit, message as given, ending with the `Co-Authored-By` trailer the session supplies.
- Build prerequisite for anything that spawns a worker from source: `modules/core/cjs` and (from phase 2) `modules/bots/cjs` exist — the ts-node worker resolves `@starwards/*` through `node_modules` workspace links, not tsconfig `paths`.
- No tombstones: when moving or deleting, delete every mention; never write "moved from" / "was removed".

---

## Phase 1 — Worker spike (gate)

Edge cases: ts-node bootstrapped inside an eval worker; `require` inside an eval worker resolves from `process.cwd()`, so every path the bootstrap requires is absolute; `__filename` inside an eval worker is `[eval]` (the main bundle's banner must not be applied to the worker bundle); SEA main may only `require` built-ins.

### 1. Worker source loader + minimal worker (dev / jest path)

**File:** `modules/server/src/bots/worker-source.ts` (new), `modules/server/src/bots/worker.ts` (new), `modules/server/src/bots/worker.spec.ts` (new)

Write the spec first: start a server with `makeDriver()` (`modules/server/src/test/driver.ts:53`), start a game, spawn the worker with `workerData: { baseUrl }`, expect a `{ type: 'ready', gameStatus: GameStatus.RUNNING }` message within 10 s, then post `{ type: 'stop' }` and expect `exit` code 0.

**Code:**

```ts
// worker-source.ts
import * as path from 'node:path';

/** Set by scripts/bundle-server.js to the bundled worker's code; undefined when running from source or cjs. */
declare const BOT_WORKER_CODE: string | undefined;

/** Code for `new Worker(code, { eval: true })`: the bundled worker, or a bootstrap that requires it from disk. */
export function botWorkerSource(): string {
    if (typeof BOT_WORKER_CODE === 'string') {
        return BOT_WORKER_CODE;
    }
    const fromSource = path.extname(__filename) === '.ts';
    const entry = path.join(__dirname, fromSource ? 'worker.ts' : 'worker.js');
    const preload = fromSource ? `require(${JSON.stringify(require.resolve('ts-node/register/transpile-only'))});` : '';
    return `${preload}require(${JSON.stringify(entry)});`;
}
```

```ts
// worker.ts (spike body; phase 5 replaces it)
import { Driver } from '@starwards/core/internal';
import { parentPort, workerData } from 'node:worker_threads';

const port = parentPort!;
const driver = new Driver(new URL((workerData as { baseUrl: string }).baseUrl)).connect();
void (async () => {
    const admin = await driver.getAdminDriver();
    port.postMessage({ type: 'ready', gameStatus: admin.state.gameStatus });
})();
port.on('message', (m: { type: string }) => {
    if (m.type === 'stop') {
        driver.destroy();
        port.close();
    }
});
```

Spec spawns with `new Worker(botWorkerSource(), { eval: true, workerData: { baseUrl: gameDriver.url() } })`.

**Verify:** `npx jest modules/server/src/bots/worker.spec.ts` → 1 passed. If ts-node cannot find a tsconfig from the eval worker, set `process.env.TS_NODE_PROJECT` to the absolute root `tsconfig.json` in the bootstrap string and re-run.

**Commit:** `feat(server): spawn a bot worker thread from source`

### 2. Worker connects from the dev server (ts-node)

**File:** `modules/server/src/prod.ts`, `modules/server/src/dev.ts`, `modules/server/src/bots/self-test.ts` (new)

Add a self-test the gate tasks reuse in dev, bundle, SEA and Docker: when `STARWARDS_BOT_SELFTEST=1`, after `server()` resolves, start a game on `training_t0` via `GameManager.startGame(mapsMap.get('training_t0'))` (map registry imported in `server.ts` as `mapsMap`), spawn the worker against `http://localhost:<port>`, log `bot worker selftest: ok` on `ready` and `process.exit(0)`, or log the error and `process.exit(1)` after 15 s.

**Code:**

```ts
// self-test.ts
import { GameManager } from '../admin/game-manager';
import { Worker } from 'node:worker_threads';
import { botWorkerSource } from './worker-source';
import { createLogger } from '@starwards/core/internal';
import { mapsMap } from '../maps';

const { info, error } = createLogger('server:bot-selftest');

export async function botWorkerSelfTest(manager: GameManager, port: number): Promise<never> {
    await manager.startGame(mapsMap.get('training_t0')!);
    const worker = new Worker(botWorkerSource(), { eval: true, workerData: { baseUrl: `http://localhost:${port}` } });
    const ok = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 15_000);
        worker.once('message', () => (clearTimeout(timer), resolve(true)));
        worker.once('error', (e) => (clearTimeout(timer), error(e), resolve(false)));
    });
    info(`bot worker selftest: ${ok ? 'ok' : 'FAILED'}`);
    await worker.terminate();
    return process.exit(ok ? 0 : 1);
}
```

Check first that `mapsMap` is exported from `modules/server/src/maps.ts` (`grep -n mapsMap modules/server/src/*.ts`); import it from wherever `server.ts` does. Call it from `main()` in `prod.ts` and in the `server(...).then` of `dev.ts`.

**Verify:** `STARWARDS_BOT_SELFTEST=1 node -r ts-node/register/transpile-only ./modules/server/src/dev.ts` → log line `bot worker selftest: ok`, exit code 0 (`echo $?`).

**Commit:** `feat(server): bot worker self-test on startup flag`

### 3. Second esbuild entry, embedded as a string

**File:** `scripts/bundle-server.js`

**Code:**

```js
/** The bot worker, bundled alone and returned as code for `new Worker(code, { eval: true })`. */
async function bundleBotWorker() {
    const result = await esbuild.build({
        entryPoints: [path.join(rootPath, 'modules', 'server', 'src', 'bots', 'worker.ts')],
        tsconfig: path.join(rootPath, 'modules', 'server', 'tsconfig.runtime.json'),
        bundle: true,
        write: false,
        platform: 'node',
        target: 'node24',
        format: 'cjs',
        conditions: ['require', 'node'],
        external: ['msgpackr-extract'],
        logLevel: 'warning',
    });
    if (result.warnings.length) {
        throw new Error(`esbuild reported ${result.warnings.length} warning(s) in the bot worker`);
    }
    return result.outputFiles[0].text;
}
```

In `bundleServer()`: `const botWorker = await bundleBotWorker();` and add `BOT_WORKER_CODE: JSON.stringify(botWorker)` to the existing `define` object.

**Verify:** `node scripts/post-build.js && STARWARDS_BOT_SELFTEST=1 PORT=8091 node dist/app/starwards.cjs` → `bot worker selftest: ok`, exit 0. Also `grep -c "BOT_WORKER_CODE" dist/app/starwards.cjs` → `0` (define replaced it).

**Commit:** `build: bundle the bot worker into the server bundle`

### 4. SEA build

**File:** none (verification only)

**Verify:** `npm run build:exe && STARWARDS_NO_OPEN=1 STARWARDS_BOT_SELFTEST=1 PORT=8092 ./dist/exec/starwards-win.exe` (Linux: `./dist/exec/starwards-linux`) → `bot worker selftest: ok`, exit 0.

**STOP:** if the SEA run fails (any error from `new Worker(code, { eval: true })` inside the executable, or `require` of a non-builtin from the worker), do not continue to phase 2 and do not work around it. Report the exact error to Amir and ask. The fallback he approved is `child_process.fork(__filename)` with a role flag, the pattern at `modules/server/src/test/training/run-training.ts:75` (`fork(__filename, [], { execArgv: process.execArgv })` + `process.on('message')`), which changes the host/worker messaging from `parentPort` to `process.send` and the crash signal from `error` to `exit`.

**Commit:** none (no file changes). If the run needed a fix, commit it as `fix(build): start the bot worker inside the single executable`.

### 5. Phase 1 gate

**File:** none

**Verify:** `npx jest modules/server/src/bots` → passed; `npm run test:types` → no errors; `npm run knip` → no new findings (the self-test is reachable from `prod.ts`, `worker.ts` from the spec and the bundle script). Record in the PR description: dev ok / bundle ok / SEA ok (platform).

**Commit:** none.

---

## Phase 2 — `@starwards/bots` package

Edge cases: `brain/policies.ts` imports `./jev-client` (`idlePolicy` and `jevPolicy` live together) — it stays in ai; `mcp/src/sandbox/manifest.ts` (`fetchStationsManifest`, used by the live path) is not in the spec's list but must move; specs that import `@starwards/server` (e.g. `mcp/src/sandbox/multiplex.spec.ts:7`) stay in their current package and import from `@starwards/bots`, so bots never depends on server; JSON brains must be `import`ed (not `fs.readFileSync`) so the worker bundle carries them.

### 6. Record the curriculum baseline before the move

**File:** none

**Verify:** run and save the outputs to the scratch folder (not the repo):
- `npx jest --selectProjects ai mcp 2>&1 | tail -5` → note the pass/fail counts.
- `npm --prefix modules/ai run suite -- --crew crews/reference.json --levels L0 --out "$TMP/suite-before"` → note every verdict line and the exit code (expected 0 against `curriculum/baselines/reference.json`).

**Commit:** none.

### 7. Scaffold the package

**File:** `modules/bots/package.json`, `modules/bots/tsconfig.json`, `modules/bots/tsconfig.runtime.json`, `modules/bots/src/index.ts`, `modules/bots/src/index.spec.ts`

Write `index.spec.ts` first: `import { BOTS_PACKAGE } from '@starwards/bots'; expect(BOTS_PACKAGE).toBe('@starwards/bots')` — fails until the jest project and package exist. (The constant is removed in task 10 when real exports land.)

**Code:**

```json
{
    "name": "@starwards/bots",
    "version": "0.0.0",
    "private": true,
    "license": "SEE LICENSE IN LICENSE.md",
    "description": "The reference crew and the station-session layer every Starwards bot plays through",
    "main": "cjs/index.js",
    "types": "cjs/index.d.ts",
    "files": ["cjs"],
    "scripts": {
        "clean": "rimraf ./cjs",
        "prebuild": "npm run clean",
        "build": "tsc -p ./tsconfig.runtime.json"
    },
    "dependencies": { "@starwards/core": "0.5.1", "zod": "4.1.12" }
}
```

`tsconfig.json` = mcp's (`extends ../../tsconfig.json`, include `./src/**/*.ts`). `tsconfig.runtime.json` = server's runtime config with `outDir: "cjs"`, `tsBuildInfoFile: "./cjs/.tsbuildinfo"`, `"declaration": true`, same core `paths`, excluding `src/**/*.spec.ts`.

**Verify:** `npm install` (links the workspace) then `npx jest modules/bots` → fails "No tests found" until task 8.

**Commit:** none (commit with task 8).

### 8. Wire bots into jest, turbo, knip, root scripts

**File:** `jest.config.js`, `turbo.json`, `knip.jsonc`, `package.json`, `.dependency-cruiser.cjs`, `modules/server/tsconfig.runtime.json`

- `jest.config.js`: add project `{ ...baseConfig, displayName: 'bots', testRegex: 'modules/bots/.*\\.spec\\.ts$' }`.
- `turbo.json`: add `"@starwards/bots#build": { "dependsOn": ["@starwards/core#build"], "outputs": ["cjs/**"] }`; add `"@starwards/bots#build"` to `dependsOn` of `@starwards/server#build` and `@starwards/mcp#build`.
- root `package.json`: `"build:bots": "npm --prefix ./modules/bots run build"`; add `./modules/bots/cjs` to `clean`.
- `knip.jsonc`: `"modules/bots": { "entry": ["src/index.ts"] }`.
- `.dependency-cruiser.cjs`: add `bots` to the cross-module cycle rule's `from` path alternation (`^modules/(browser|server|node-red|mcp|ai|bots)/`).
- `modules/server/tsconfig.runtime.json` `paths`: `"@starwards/bots": ["../bots/cjs"]`.

**Verify:** `npx jest modules/bots` → 1 passed; `npx turbo run build --filter=@starwards/bots --dry=json | grep -c '@starwards/core#build'` → ≥1.

**Commit:** `build(bots): add the @starwards/bots workspace package`

### 9. Move the station-session layer from mcp

**File:** `git mv` into `modules/bots/src/session/`: `modules/mcp/src/sandbox/{session,console,multiplex,command-map,manifest}.ts`, `modules/mcp/src/radar/radar-view.ts` → `modules/bots/src/session/radar-view.ts`, `modules/mcp/src/readers.ts`, `modules/mcp/src/contacts.ts`. Specs: `git mv` a spec with its source only if `grep -L "@starwards/server" <spec>` lists it; otherwise leave it in mcp.

Fix relative imports inside the moved files (`../radar/radar-view` → `./radar-view`, `../contacts` → `./contacts`, `./sandbox/session` → `./session`). Export from `modules/bots/src/index.ts`:

```ts
export * from './session/session';
export * from './session/console';
export * from './session/multiplex';
export * from './session/command-map';
export * from './session/manifest';
export * from './session/radar-view';
export * from './session/readers';
export * from './session/contacts';
```

Rewrite importers to `@starwards/bots`: `modules/mcp/src/server.ts:12-15`, remaining mcp specs, `modules/ai/src/console/headless.ts:1,10,13`, `modules/ai/src/console/live.ts:3-8`, `modules/ai/src/crew/crew.ts:9,11`, `modules/ai/src/crew/crew-config.ts:15`, `modules/ai/src/live/live-crew.ts:6,9`. Add `"@starwards/bots": "0.0.0"` to `dependencies` of mcp and ai; remove `@starwards/mcp` from ai's `dependencies` if no import of it remains (`grep -rn "@starwards/mcp" modules/ai/src`).

`modules/mcp/package.json` already lists `@starwards/server` under `devDependencies` — no change needed there.

**Verify:** `npx jest --selectProjects mcp bots ai` → same pass counts as task 6 (sum across mcp+bots equals the old mcp count); `npm run test:types` → clean.

**Commit:** `refactor(bots): move the station-session layer from mcp`

### 10. Move the brain stack, what-if forecasts and crew channel

**File:** `git mv` into `modules/bots/src/brain/`: `modules/ai/src/brain/{brain,callout,catalogue,controls,request,spec,verbal,reference-policy,engineer-policies,helms-policies,weapons-policies}.ts`; into `modules/bots/src/whatif/`: `modules/ai/src/whatif/*.ts`; `modules/ai/src/crew/channel.ts` → `modules/bots/src/crew/channel.ts`. Stay in ai: `jev-cache.ts`, `jev-client.ts`, `policies.ts` (imports `./jev-client`), their specs. Specs move with their source when they do not import `@starwards/server` (check each: `controls.spec`, `callout.spec`, `verbal.spec`, `engineer-policies.spec`, `weapons-policies.spec`, `reference-*.spec`, `tactical.spec`, `whatif.spec`, `channel.spec`).

Replace the temporary `BOTS_PACKAGE` with re-exports of what the consumers import (derive the list: `grep -rhn "from '\.\./brain/\|from '\.\./whatif/\|from '\./channel'\|from '\.\./crew/channel'" modules/ai/src modules/server/src`). Delete `index.spec.ts`.

Rewrite every ai import of the moved files to `@starwards/bots`; `policies.ts` imports `Policy` and `BrainSpec` from `@starwards/bots`.

**Verify:** `npx jest --selectProjects ai bots` → total passing equals task 6's ai count; `npm run test:types` → clean; `npx depcruise --config .dependency-cruiser.cjs modules` → no violations.

**Commit:** `refactor(bots): move the brain stack and reference crew into @starwards/bots`

### 11. Reference brains as imported JSON

**File:** `git mv modules/ai/brains/{helms,weapons,engineer,signals,tactical}.v1.json modules/bots/src/brains/`; `modules/bots/src/reference-crew.ts` (new), `modules/bots/src/reference-crew.spec.ts` (new); `modules/ai/src/crew/crew-config.ts:19,58`; `modules/ai/src/benchmarks/run-benchmark.ts:16,74`; `modules/ai/src/benchmarks/helms-benchmarks.spec.ts:22`; `modules/ai/src/brain/tactical.spec.ts:70` (now in bots if it moved); `modules/ai/crews/jev-tactical-t1-e10-s3.json:7`.

Spec first: `referenceSeatPlan('helms').spec.station === 'helms'`, for each of helms/weapons/engineer/signals/tactical; `referenceSeatPlan('dradis')` throws.

**Code:**

```ts
import { BrainSpec, brainSpecSchema } from './brain/spec';

import { Policy } from './brain/brain';
import engineer from './brains/engineer.v1.json';
import helms from './brains/helms.v1.json';
import { makeReferencePolicy } from './brain/reference-policy';
import signals from './brains/signals.v1.json';
import tactical from './brains/tactical.v1.json';
import weapons from './brains/weapons.v1.json';

/** One seat of a crew: a station, the brain that plays it, and what answers its questions. */
export type SeatPlan = { station: string; spec: BrainSpec; policy: Policy };

const referenceBrains: Record<string, unknown> = { helms, weapons, engineer, signals, tactical };

/** Where the reference brain files live, for crew files that name them by path. */
export const REFERENCE_BRAINS_DIR = `${__dirname}/brains`;

/** The rule-based reference brain for a station, as the live bots and the headless curriculum both play it. */
export function referenceSeatPlan(station: string): SeatPlan {
    const raw = referenceBrains[station];
    if (!raw) {
        throw new Error(`no reference brain for station "${station}"`);
    }
    const spec = brainSpecSchema.parse(raw);
    return { station, spec, policy: makeReferencePolicy(spec.decisionSeconds) };
}
```

Move `SeatPlan` here from `modules/ai/src/crew/crew.ts:16` (ai imports it from `@starwards/bots`). In `crew-config.ts`, default brain path becomes `path.join(REFERENCE_BRAINS_DIR, `${station}.v1.json`)`, and the `reference` policy branch is unchanged (crew files may name a non-v1 brain). Update the other references to `REFERENCE_BRAINS_DIR` (TS) or `../../bots/src/brains/tactical.v1.json` (crew JSON, relative to `modules/ai/crews`).

**Verify:** `npx jest --selectProjects ai bots` → all pass; `ls modules/ai/brains | grep -c v1.json` → `0`.

**Commit:** `refactor(bots): reference brains ship inside @starwards/bots`

### 12. Phase 2 gate

**File:** none

**Verify:**
- `npm run build` → turbo builds core → bots → server/mcp; `ls modules/bots/cjs/index.js modules/bots/cjs/brains/helms.v1.json` both exist.
- `npx jest --selectProjects ai mcp bots` → counts equal task 6 (redistributed across packages).
- `npm --prefix modules/ai run suite -- --crew crews/reference.json --levels L0 --out "$TMP/suite-after"` → identical verdict lines and exit code to task 6.
- `npm run knip` → clean; `npm run test:types` → clean.

**Commit:** none.

---

## Phase 3 — Seat table in core

Edge cases: `weapons` and `engineer` are both a seat and a screen name; `tactical` must stay out of the roster and in MCP; MCP must not gain a new `sigint` login station (the table marks a multiplexed station as a seat whose bot station is not one of its screens).

### 13. Seat table

**File:** `modules/core/src/stations-manifest.ts`, `modules/core/src/stations-manifest.spec.ts` (new), `modules/core/src/index.public.ts`

Spec first: `rosterSeats` is `['pilot','weapons','engineer','sigint']`; `seatScreens('sigint')` is `['signals','dradis','target-details']`; `seatOfScreen('dradis') === 'sigint'`; `seatOfScreen('gm') === undefined`; `multiplexedStations` equals `{ tactical: ['helms','weapons'] }`.

**Code:**

```ts
/**
 * A seat is what one player (or one bot) plays; a screen is what one client shows. A human may need
 * several clients for one seat. `bot` is the station a bot of this seat plays through: one of its
 * screens, or a fused station of several (`tactical`). A `botOnly` seat never appears on the roster.
 */
type SeatRow = { screens: readonly string[]; bot: string; botOnly?: boolean };

export const bridgeSeats = {
    pilot: { screens: ['helms'], bot: 'helms' },
    weapons: { screens: ['weapons'], bot: 'weapons' },
    engineer: { screens: ['engineer'], bot: 'engineer' },
    sigint: { screens: ['signals', 'dradis', 'target-details'], bot: 'signals' },
    tactical: { screens: ['helms', 'weapons'], bot: 'tactical', botOnly: true },
} as const satisfies Record<string, SeatRow>;

export type BridgeSeat = keyof typeof bridgeSeats;

export const rosterSeats = (Object.keys(bridgeSeats) as BridgeSeat[]).filter(
    (s) => !(bridgeSeats[s] as SeatRow).botOnly,
);

export function isBridgeSeat(seat: string): seat is BridgeSeat {
    return Object.hasOwn(bridgeSeats, seat);
}

export function seatScreens(seat: BridgeSeat): readonly string[] {
    return bridgeSeats[seat].screens;
}

/** The roster seat a screen belongs to. */
export function seatOfScreen(screen: string): BridgeSeat | undefined {
    return rosterSeats.find((s) => seatScreens(s).includes(screen));
}

/** Fused stations: seats whose bot plays a station that is none of their screens, keyed by that station. */
export const multiplexedStations: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
    Object.values(bridgeSeats as Record<string, SeatRow>)
        .filter((row) => !row.screens.includes(row.bot))
        .map((row) => [row.bot, row.screens]),
);
```

Export all from `index.public.ts` next to `isAssignableSeat`.

**Verify:** `npx jest modules/core/src/stations-manifest.spec.ts` → passes.

**Commit:** `feat(core): bridge seat table`

### 14. Multiplex reads the core table

**File:** `modules/bots/src/session/multiplex.ts:9-11`

Delete the local `multiplexedStations` constant; `import { multiplexedStations } from '@starwards/core/internal'`. Remove `multiplexedStations` from the bots index if it was re-exported; fix any importer to take it from core.

**Verify:** `npx jest --selectProjects mcp bots` → multiplex specs unchanged and passing; `npm run knip` → clean.

**Commit:** `refactor(bots): multiplexed stations come from the core seat table`

### 15. Phase 3 gate

**File:** none

**Verify:** `npm run build:core && npm run test:types && npx jest --selectProjects core mcp bots ai` → all pass.

**Commit:** none.

---

## Phase 4 — `AdminState.bots` and `assignBot`

Edge cases: assignment to a non-player ship, unknown seat, `botOnly` seat or unknown brain → ignored; same brain re-chosen while `running` → no-op; re-chosen while `failed` → restart; ship leaves `playerShipIds` (convert to NPC via `convertShipType`) → its bots stop; commands outside RUNNING → ignored; bot ids are not station ids — they never enter `AdminState.stations`, so the 16-char station-id rule (`core/src/stations/registry.ts:5`) does not apply and the counter is unbounded.

### 16. Bot schema and command in core

**File:** `modules/core/src/admin/bots.ts` (new), `modules/core/src/admin/index.ts`, `modules/core/src/admin/bots.spec.ts` (new), `modules/core/src/index.public.ts`, `modules/core/src/client/admin.ts`

Spec first: `assignBot.setValue(state, arg)` pushes onto `state.assignBotCommands`; a fresh `AdminState` has `bots.size === 0`.

**Code:**

```ts
import { MapSchema, Schema } from '@colyseus/schema';

import { StateCommand } from '../commands';
import { gameField } from '../game-field';

/** Brains the GM can seat. Jev brains are added here; the roster lists whatever this holds. */
export const botBrains = ['reference'] as const;
export type BotBrain = (typeof botBrains)[number];
export const isBotBrain = (b: string): b is BotBrain => (botBrains as readonly string[]).includes(b);

export const botStatuses = ['starting', 'running', 'failed'] as const;
export type BotStatus = (typeof botStatuses)[number];

/** A bot holding one seat of one ship. Never a station-registry entry. */
export class BotEntry extends Schema {
    @gameField('string') id = '';
    @gameField('string') brain = '';
    @gameField('string') status: BotStatus = 'starting';
    /** Why the bot failed; empty otherwise. */
    @gameField('string') message = '';
}

/** One ship's bots, keyed by seat. */
export class ShipBots extends Schema {
    @gameField({ map: BotEntry }) seats = new MapSchema<BotEntry>();
}

/** `brain: 'none'` stops the seat's bot. */
export type AssignBotArg = { shipId: string; seat: string; brain: string };

export interface BotAssignable {
    assignBotCommands: AssignBotArg[];
}

export const assignBot: StateCommand<AssignBotArg, Schema & BotAssignable, void> = {
    cmdName: 'assignBot',
    setValue: (state, value) => {
        state.assignBotCommands.push(value);
    },
};
```

In `AdminState`: `@gameField({ map: ShipBots }) bots = new MapSchema<ShipBots>();` and `public assignBotCommands = Array.of<AssignBotArg>();`, `implements StationRegistrable, BotAssignable`. In `AdminDriver` (`client/admin.ts:64`): `assignBot: (arg: AssignBotArg) => adminRoom.send(assignBot.cmdName, { value: arg }),`.

**Verify:** `npx jest modules/core/src/admin/bots.spec.ts` → passes; `npm run build:core` succeeds.

**Commit:** `feat(core): AdminState bots and the assignBot command`

### 17. AdminRoom receives `assignBot`

**File:** `modules/server/src/admin/room.ts:94`, `modules/server/src/admin/bots.spec.ts` (new)

Spec first (with `makeDriver()` and a client `Driver`): `admin.assignBot({ shipId, seat: 'pilot', brain: 'reference' })` → within 2 s `gameManager.state.assignBotCommands` was drained and `state.bots.get(shipId)?.seats.get('pilot')?.brain === 'reference'` (fails until task 18 drains it; this task makes the message arrive — assert first with a spy on `manager.state.assignBotCommands.push`).

**Code:** `this.onMessage(assignBot.cmdName, cmdReceiver(manager, assignBot));`

**Verify:** `npx jest modules/server/src/admin/bots.spec.ts -t "arrives"` → passes.

**Commit:** `feat(server): admin room accepts assignBot`

### 18. GameManager drains `assignBotCommands`

**File:** `modules/server/src/admin/game-manager.ts`, `modules/server/src/admin/bots.spec.ts`

Tests (unit, on `new GameManager()` after `startGame(two_vs_one)`, with a fake `BotSeats` recording calls):
- valid assign → entry `{ id: 'bot-pilot-1', brain: 'reference', status: 'starting' }`, fake got `start(shipId, 'pilot', entry.id, 'reference')`;
- second ship's seat → id `bot-<seat>-2` (counter is server-wide);
- `none` → entry removed, fake got `stop(shipId, 'pilot')`;
- invalid ship / seat `tactical` / brain `jev` / game STOPPED → no entry, no call;
- same brain while `running` → no call; while `failed` → `stop` then `start` with a new id;
- `state.stations` never contains a `BOT-` id.

**Code:**

```ts
/** What runs the bots the GM seats; the server installs the worker supervisor. */
export interface BotSeats {
    start(shipId: string, seat: BridgeSeat, botId: string, brain: BotBrain): void;
    stop(shipId: string, seat: BridgeSeat): void;
    /** Stops every bot of every ship and resolves once their workers are gone. */
    stopAll(): Promise<void>;
}

const noBots: BotSeats = { start: () => {}, stop: () => {}, stopAll: async () => {} };

// fields
public botSeats: BotSeats = noBots;
private botCounter = 0;

// in drainStationCommands(), after assignStationCommands:
for (const arg of this.state.assignBotCommands) {
    this.applyBotAssignment(arg);
}
this.state.assignBotCommands = [];

private applyBotAssignment({ shipId, seat, brain }: AssignBotArg) {
    if (!this.state.isGameRunning || !this.state.playerShipIds.includes(shipId) || !rosterSeats.includes(seat as BridgeSeat)) {
        return;
    }
    const bridgeSeat = seat as BridgeSeat;
    const current = this.state.bots.get(shipId)?.seats.get(bridgeSeat);
    if (brain === 'none') {
        if (current) this.removeBot(shipId, bridgeSeat);
        return;
    }
    if (!isBotBrain(brain) || (current && current.brain === brain && current.status !== 'failed')) {
        return;
    }
    if (current) this.removeBot(shipId, bridgeSeat);
    let ship = this.state.bots.get(shipId);
    if (!ship) {
        ship = new ShipBots();
        this.state.bots.set(shipId, ship);
    }
    const entry = new BotEntry();
    entry.id = `bot-${bridgeSeat}-${++this.botCounter}`;
    entry.brain = brain;
    ship.seats.set(bridgeSeat, entry);
    this.botSeats.start(shipId, bridgeSeat, entry.id, brain);
}

private removeBot(shipId: string, seat: BridgeSeat) {
    const ship = this.state.bots.get(shipId);
    ship?.seats.delete(seat);
    if (ship && ship.seats.size === 0) this.state.bots.delete(shipId);
    this.botSeats.stop(shipId, seat);
}

/** Called by the supervisor with what a ship's worker reports; ignores bots that were stopped meanwhile. */
public setBotStatus(shipId: string, seat: BridgeSeat, botId: string, status: BotStatus, message = '') {
    const entry = this.state.bots.get(shipId)?.seats.get(seat);
    if (entry && entry.id === botId) {
        entry.status = status;
        entry.message = message;
    }
}
```

**Verify:** `npx jest modules/server/src/admin/bots.spec.ts` → all pass.

**Commit:** `feat(server): GameManager seats and unseats bots`

### 19. Reset on stop, and on a player ship leaving

**File:** `modules/server/src/admin/game-manager.ts:249-271`, `modules/server/src/admin/bots.spec.ts`

Tests: after `stopGame()` → `state.bots.size === 0` and fake `stopAll` awaited before `gameStatus` reached STOPPED; after `loadGame(...)` → `bots.size === 0`; `convertShipType(shipId, false)` on a botted player ship → its entries gone and `stop` called per seat; `saveGame()` output contains no `bots` (assert `JSON.stringify(manager.saveGame()!.toJSON())` has no `"bots"`).

**Code:** in `stopGame()` immediately after `this.state.gameStatus = GameStatus.STOPPING;`:

```ts
this.state.bots.clear();
await this.botSeats.stopAll();
```

In `reconcileStationAssignments()` (runs every RUNNING tick and after start/load), add first:

```ts
for (const [shipId, ship] of [...this.state.bots]) {
    if (!this.state.playerShipIds.includes(shipId)) {
        for (const seat of [...ship.seats.keys()]) this.removeBot(shipId, seat as BridgeSeat);
    }
}
```

**Verify:** `npx jest modules/server/src/admin` → all pass.

**Commit:** `feat(server): bots reset when the game stops or a ship leaves the players`

### 20. Phase 4 gate

**File:** none

**Verify:** `npm run build:core && npm run test:types && npx jest --selectProjects core server` → all pass; `npm run knip` → clean.

**Commit:** none.

---

## Phase 5 — Ship crew runner and worker host

Edge cases: a seat added while another seat's decision is in flight; a seat removed while its buttons are held (`gameTimeWait` timers) — removal awaits that seat's in-flight promises before closing; decisions skipped, not queued, when a seat is still busy (`busy` flag, as `live-crew.ts`); the ship not yet in the space room when the first seat arrives (`driver.waitForShip`); worker `error` after a graceful `stop` was requested; worker `exit` with code 0 while bots are still seated (treat as failure); `resourceLimits` hit → `error` event with `ERR_WORKER_OUT_OF_MEMORY`.

### 21. Message protocol

**File:** `modules/server/src/bots/protocol.ts` (new)

**Code:**

```ts
import { BotBrain, BotStatus, BridgeSeat } from '@starwards/core/internal';

export type WorkerInit = { baseUrl: string; shipId: string };

export type ToWorker =
    | { type: 'seat'; seat: BridgeSeat; botId: string; brain: BotBrain }
    | { type: 'unseat'; seat: BridgeSeat }
    | { type: 'record'; on: boolean }
    | { type: 'stop' };

export type FromWorker =
    | { type: 'status'; seat: BridgeSeat; botId: string; status: BotStatus; message?: string }
    | { type: 'event'; kind: string; objectId?: string; data?: unknown }
    | { type: 'log'; level: 'info' | 'error'; message: string }
    | { type: 'stopped' };
```

**Verify:** `npm run test:types` → clean.

**Commit:** `feat(server): bot worker message protocol`

### 22. Live session without registration in bots

**File:** `modules/bots/src/live-station.ts` (new, adapted from `modules/ai/src/console/live.ts`), `modules/bots/src/index.ts`

Adapt `liveStation`: takes a shared `{ manifest, shipDriver, spaceDriver, radar, wait }` context instead of fetching per seat, and does not call `beginStationRegistration` — bots are never registry entries (spec "Decided how"). Its only remaining caller after phase 8 is the server, so registration is dropped rather than made an option nobody sets. Keep `gameTimeWait` and `HOLD_POLL_MS` as in `live.ts:16-38`.

**Code:**

```ts
export type LiveShipContext = {
    manifest: StationsManifest;
    shipDriver: ShipDriver;
    spaceDriver: SpaceDriver;
    radar: RadarView;
    wait: (seconds: number) => Promise<void>;
};

/** Everything a ship's seats share: one manifest fetch, one radar view, one game-time clock. */
export async function liveShipContext(driver: Driver, baseUrl: URL, shipId: string): Promise<LiveShipContext> {
    const manifest = withMultiplexedStations(await fetchStationsManifest(baseUrl, shipId));
    await driver.waitForShip(shipId);
    const spaceDriver = await driver.getSpaceDriver();
    return {
        manifest,
        shipDriver: await driver.getShipDriver(shipId),
        spaceDriver,
        radar: RadarView.fromDriver(spaceDriver),
        wait: gameTimeWait(await driver.getAdminDriver()),
    };
}

/** Opens a station through the same session layer the MCP uses, so a bot sees what a player at it sees. */
export function liveStation(ctx: LiveShipContext, station: string): StationSession {
    if (!ctx.manifest.stations[station]?.enabled) {
        throw new Error(`station "${station}" is not open on ${ctx.shipDriver.id}`);
    }
    const options = { radar: ctx.radar, wait: ctx.wait };
    return openStation(ctx.manifest, station, (s, entry) => new StationSession(s, entry, ctx.shipDriver, ctx.spaceDriver, options));
}
```

Confirm `ShipDriver`/`SpaceDriver` type names exported from `@starwards/core/internal` (`grep -n "export type ShipDriver\|export type SpaceDriver" modules/core/src/client/*.ts`) and `shipDriver.id` (used by `multiplex.spec.ts`'s fake); adjust names to what exists.

**Verify:** `npm run build --workspace=@starwards/bots` (or `npm run build:bots`) and `npm run test:types` → clean (behaviour covered in task 24).

**Commit:** `feat(bots): live station sessions sharing one ship context`

### 23. Ship crew runner — failing spec

**File:** `modules/server/src/bots/ship-crew.spec.ts` (new)

Cloned from `modules/ai/src/live/live-crew.spec.ts`, against `makeDriver()` + `training_t0`, ship `GVTS`, in-process (no worker):
- `addSeat('pilot', 'bot-pilot-1', 'reference')`, `addSeat('weapons', …)`, `addSeat('engineer', …)` → within 15 game seconds decisions for helms, weapons, engineer; no `brain_error`; a target locked (`gameDriver.getShip('GVTS').state.weaponsTarget.targetId` truthy).
- `onStatus` reported `running` for each seat after its first decision.
- `setRecording(false)` (default) → `emit` never called; `setRecording(true)` → `decision` events with `objectId: 'GVTS'`.
- `removeSeat('weapons')` while running → no further weapons decisions; others continue.
- `stop()` resolves after in-flight work; afterwards no events.

**Verify:** `npx jest modules/server/src/bots/ship-crew.spec.ts` → fails (module not found).

**Commit:** none (commit with task 24).

### 24. Ship crew runner — implementation

**File:** `modules/server/src/bots/ship-crew.ts` (new)

Adapted from `modules/ai/src/live/live-crew.ts`: `decide()` body (`live-crew.ts:116-175`) and `tick()` (`:177-195`) are kept; changes: seats live in a `Map<BridgeSeat, Seat>`; the clock is the non-record branch of `gameClock` only (server stamps events); `emit` is a no-op unless `recording`; the first completed decision of a seat reports `running`; a seat whose session cannot open reports `failed` with the message.

**Code:**

```ts
type ShipCrewOptions = {
    driver: Driver;
    baseUrl: URL;
    shipId: string;
    emit: (event: Omit<RecordingEventLine, 't'>) => void;
    onStatus: (seat: BridgeSeat, botId: string, status: BotStatus, message?: string) => void;
    pollMs?: number;
};

type Seat = {
    botId: string;
    plan: SeatPlan;
    brain: ButtonBrain;
    session: StationSession;
    nextDecisionAt: number;
    busy: boolean;
    running: boolean;
    inFlight: Set<Promise<unknown>>;
};

export async function shipCrew(options: ShipCrewOptions) {
    const ctx = await liveShipContext(options.driver, options.baseUrl, options.shipId);
    const admin = await options.driver.getAdminDriver();
    const seats = new Map<BridgeSeat, Seat>();
    const channel = crewChannel();
    let recording = false;
    let stopped = false;
    let seconds = 0;
    let wallAt = performance.now();
    const emit = (kind: string, data: unknown) => {
        if (recording) options.emit({ kind, objectId: options.shipId, data });
    };
    // decide(seat) and tick() as in live-crew.ts, tracking promises in seat.inFlight,
    // and after a successful decide: if (!seat.running) { seat.running = true; options.onStatus(key, seat.botId, 'running'); }

    function addSeat(seat: BridgeSeat, botId: string, brain: BotBrain) {
        // brain is 'reference' today; Jev brains branch here
        const plan = referenceSeatPlan(bridgeSeats[seat].bot);
        try {
            seats.set(seat, {
                botId, plan, brain: buttonBrain(plan.spec, plan.policy),
                session: liveStation(ctx, plan.station),
                nextDecisionAt: seconds, busy: false, running: false, inFlight: new Set(),
            });
        } catch (e) {
            options.onStatus(seat, botId, 'failed', (e as Error).message);
        }
    }

    async function removeSeat(seat: BridgeSeat) {
        const s = seats.get(seat);
        seats.delete(seat);
        while (s?.inFlight.size) await Promise.allSettled([...s.inFlight]);
    }

    const loop = (async () => {
        while (!stopped) {
            const now = performance.now();
            seconds += ((now - wallAt) / 1000) * admin.state.speed;
            wallAt = now;
            tick();
            await new Promise((r) => setTimeout(r, options.pollMs ?? 50));
        }
    })();

    return {
        addSeat,
        removeSeat,
        setRecording: (on: boolean) => void (recording = on),
        get seatCount() { return seats.size; },
        async stop() {
            stopped = true;
            await loop;
            await Promise.all([...seats.keys()].map(removeSeat));
        },
    };
}
```

`decide` must check `seats.get(key) === seat` before pressing (a removed seat never presses again).

**Verify:** `npx jest modules/server/src/bots/ship-crew.spec.ts` → all pass.

**Commit:** `feat(server): ship crew runner with dynamic seats and a record switch`

### 25. Worker entry runs the crew

**File:** `modules/server/src/bots/worker.ts` (replace spike body), `modules/server/src/bots/worker.spec.ts`

Spec: spawn worker with `workerData: { baseUrl, shipId: 'GVTS' } satisfies WorkerInit`; post `{ type: 'seat', seat: 'pilot', botId: 'bot-pilot-1', brain: 'reference' }` → receive `status running` for `bot-pilot-1`; post `{ type: 'record', on: true }` → receive `event` messages with `kind: 'decision'`; post `stop` → receive `stopped`, then `exit` 0.

**Code:**

```ts
const port = parentPort!;
const { baseUrl, shipId } = workerData as WorkerInit;
const send = (m: FromWorker) => port.postMessage(m);
const log = (level: 'info' | 'error', message: string) => send({ type: 'log', level, message });
const driver = new Driver(new URL(baseUrl)).connect();
const pending: ToWorker[] = [];
let crew: Awaited<ReturnType<typeof shipCrew>> | null = null;

async function handle(m: ToWorker) {
    if (!crew) return void pending.push(m);
    switch (m.type) {
        case 'seat':   log('info', `${m.botId} seated on ${m.seat}`); return crew.addSeat(m.seat, m.botId, m.brain);
        case 'unseat': return crew.removeSeat(m.seat);
        case 'record': return crew.setRecording(m.on);
        case 'stop':
            await crew.stop();
            driver.destroy();
            send({ type: 'stopped' });
            port.close();
    }
}
port.on('message', (m: ToWorker) => void handle(m).catch((e: unknown) => log('error', String(e))));
void shipCrew({
    driver, baseUrl: new URL(baseUrl), shipId,
    emit: (e) => send({ type: 'event', ...e }),
    onStatus: (seat, botId, status, message) => send({ type: 'status', seat, botId, status, message }),
}).then(async (c) => {
    crew = c;
    for (const m of pending.splice(0)) await handle(m);
});
```

A `stop` that arrives before `crew` exists is queued like the rest. An exception that escapes (e.g. `shipCrew` rejects) is unhandled in the worker → the host gets `error`.

**Verify:** `npx jest modules/server/src/bots/worker.spec.ts` → passes.

**Commit:** `feat(server): bot worker runs a ship crew`

### 26. Supervisor — failing spec

**File:** `modules/server/src/bots/supervisor.spec.ts` (new)

With `makeDriver()` (server installs the supervisor in task 28; this spec constructs it directly with the manager and `() => gameDriver.url()`):
- `start(ship, 'pilot', id, 'reference')` → one worker (`workerCount === 1`), entry becomes `running` within 10 s.
- a second seat on the same ship → still one worker.
- `stop` of the last seat → worker exits within the grace timeout; `workerCount === 0`.
- a worker that throws: construct the supervisor with its 4th parameter `source` returning `"require('node:worker_threads').parentPort.once('message', () => { throw new Error('boom'); })"` → every bot of that ship `failed` with a message containing `boom`; game still RUNNING; no restart (`workerCount === 0` after 2 s).
- `stopAll()` with two ships → resolves; `workerCount === 0`.

**Verify:** `npx jest modules/server/src/bots/supervisor.spec.ts` → fails (module not found).

**Commit:** none (commit with task 27).

### 27. Supervisor — implementation

**File:** `modules/server/src/bots/supervisor.ts` (new)

**Code:**

```ts
const { info: logInfo, error: logError } = createLogger('server:bots');

/** Wall time a stopping worker gets to drain its crew and close its connections before it is terminated. */
const STOP_GRACE_MS = 5_000;
/** Heap cap per ship worker; hitting it fails that ship's bots, not the server. */
const WORKER_HEAP_MB = 256;

type ShipWorker = { worker: Worker; seats: Set<BridgeSeat>; exited: Promise<void>; stopping: boolean };

export class BotSupervisor implements BotSeats {
    private ships = new Map<string, ShipWorker>();
    private recording = false;

    constructor(
        private manager: GameManager,
        private baseUrl: () => string,
        private onEvent: (event: Omit<RecordingEventLine, 't'>) => void,
        private source: () => string = botWorkerSource,
    ) {}

    get workerCount() {
        return this.ships.size;
    }

    start(shipId: string, seat: BridgeSeat, botId: string, brain: BotBrain) {
        const ship = this.ships.get(shipId) ?? this.spawn(shipId);
        ship.seats.add(seat);
        ship.worker.postMessage({ type: 'seat', seat, botId, brain } satisfies ToWorker);
    }

    stop(shipId: string, seat: BridgeSeat) {
        const ship = this.ships.get(shipId);
        if (!ship) return;
        ship.seats.delete(seat);
        ship.worker.postMessage({ type: 'unseat', seat } satisfies ToWorker);
        if (ship.seats.size === 0) void this.retire(shipId, ship);
    }

    async stopAll() {
        await Promise.all([...this.ships].map(([id, ship]) => this.retire(id, ship)));
    }

    /** Called when the recorder starts or stops; workers post events only while it records. */
    setRecording(on: boolean) {
        this.recording = on;
        for (const { worker } of this.ships.values()) worker.postMessage({ type: 'record', on } satisfies ToWorker);
    }

    private spawn(shipId: string): ShipWorker {
        const worker = new Worker(this.source(), {
            eval: true,
            workerData: { baseUrl: this.baseUrl(), shipId } satisfies WorkerInit,
            resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
        });
        const exited = new Promise<void>((resolve) => worker.once('exit', () => resolve()));
        const ship: ShipWorker = { worker, seats: new Set(), exited, stopping: false };
        this.ships.set(shipId, ship);
        worker.postMessage({ type: 'record', on: this.recording } satisfies ToWorker);
        worker.on('message', (m: FromWorker) => {
            if (m.type === 'status') this.manager.setBotStatus(shipId, m.seat, m.botId, m.status, m.message);
            else if (m.type === 'event') this.onEvent({ kind: m.kind, objectId: m.objectId, data: m.data });
            else if (m.type === 'log') (m.level === 'error' ? logError : logInfo)(`[${shipId}] ${m.message}`);
        });
        worker.on('error', (e) => this.fail(shipId, ship, e.message));
        worker.on('exit', (code) => {
            if (!ship.stopping) this.fail(shipId, ship, `bot worker exited (code ${code})`);
        });
        return ship;
    }

    private fail(shipId: string, ship: ShipWorker, message: string) {
        logError(`[${shipId}] bot worker failed: ${message}`);
        for (const seat of ship.seats) {
            const botId = this.manager.state.bots.get(shipId)?.seats.get(seat)?.id;
            if (botId) this.manager.setBotStatus(shipId, seat, botId, 'failed', message);
        }
        if (this.ships.get(shipId) === ship) this.ships.delete(shipId);
        ship.stopping = true;
        void ship.worker.terminate();
    }

    private async retire(shipId: string, ship: ShipWorker) {
        if (this.ships.get(shipId) === ship) this.ships.delete(shipId);
        if (ship.stopping) return ship.exited;
        ship.stopping = true;
        ship.worker.postMessage({ type: 'stop' } satisfies ToWorker);
        const timer = setTimeout(() => void ship.worker.terminate(), STOP_GRACE_MS);
        await ship.exited;
        clearTimeout(timer);
    }
}
```

Re-choosing a bot on a `failed` seat calls `GameManager.removeBot` → `stop` (no ship worker: no-op) → `start` → fresh worker, satisfying "GM can choose the bot again".

**Verify:** `npx jest modules/server/src/bots/supervisor.spec.ts` → all pass.

**Commit:** `feat(server): bot supervisor, one worker per ship`

### 28. Install the supervisor in `server()`

**File:** `modules/server/src/server.ts:64-80,264-268`

After `const gameRecorder = …`: 

```ts
const bots = new BotSupervisor(manager, () => `http://localhost:${boundPort}`, (e) => gameRecorder.appendEvent(e));
manager.botSeats = bots;
```

(`appendEvent` lands in task 31; until then pass `() => {}` and change it there.) In `close()`, before `gameRecorder.stopRecording()`: `await bots.stopAll();`.

Test in `modules/server/src/admin/bots.spec.ts`: through a client `Driver`, `admin.assignBot({ shipId: 'GVTS', seat: 'pilot', brain: 'reference' })` on `training_t0` → `admin.state.bots.get('GVTS')?.seats.get('pilot')?.status` becomes `running` within 10 s.

**Verify:** `npx jest modules/server/src/admin/bots.spec.ts` → passes; jest exits without open-handle warnings (`npx jest modules/server/src/admin/bots.spec.ts --detectOpenHandles` → no handles listed).

**Commit:** `feat(server): the game server runs GM-seated bots`

### 29. Phase 5 gate

**File:** none

**Verify:** `npm run build && npx jest --selectProjects server bots core` → pass; `node scripts/post-build.js && STARWARDS_BOT_SELFTEST=1 PORT=8091 node dist/app/starwards.cjs` → ok (the bundled worker is now the real crew entry, so the self-test's `ready`-message wait becomes: post `seat pilot`, wait for `status running`; update `self-test.ts` accordingly in this task if it no longer passes); `npm run build:exe` + SEA self-test → ok; `npm run knip` clean.

**Commit:** `test(server): bot self-test seats a real bot` (only if `self-test.ts` changed).

---

## Phase 6 — Decision sidecar

Edge cases: events arriving after `stopRecording()` began (dropped); events while the deltas `endDeltas()` flush is awaited (dropped once `eventsPath` is null); a recording with no bot events → no sidecar file; recording auto-finalized by game stop (`autoFinalizeDeltas` / `writeFrame` → `finalize()`) closes the sidecar too; the recorder must tell the supervisor recording on/off from every path that sets `isRecordingGame`.

### 30. `appendEvent` — failing spec

**File:** `modules/server/src/recording/game-recorder.spec.ts`

Tests: `appendEvent({ kind: 'decision', objectId: 'GVTS', data: {} })` while not recording → no `*.events.jsonl` in the dir; after `startRecording()` → `<base>.events.jsonl` beside `<base>.sgr` with lines parsing via `parseEventLine`, `t` ≥ 0 and non-decreasing; after `stopRecording()` resolves, a further `appendEvent` writes nothing; recording with no events → no sidecar file.

**Verify:** `npx jest modules/server/src/recording/game-recorder.spec.ts` → new tests fail (`appendEvent` not a function).

**Commit:** none (commit with task 31).

### 31. `appendEvent` — implementation

**File:** `modules/server/src/recording/game-recorder.ts`, `modules/server/src/server.ts`

**Code:**

```ts
private eventsPath: string | null = null;
private eventWrites: Promise<void> = Promise.resolve();
/** Told whenever recording starts or ends, so bot workers post decisions only while they are kept. */
public onRecordingChange: (on: boolean) => void = () => {};

/** Appends a sidecar event stamped on this recording's clock. Dropped when nothing is recording. */
public appendEvent(event: Omit<RecordingEventLine, 't'>) {
    const eventsPath = this.eventsPath;
    if (!eventsPath) return;
    const line = encodeEventLine({ t: this.manager.totalSeconds - this.baseSeconds, ...event });
    this.eventWrites = this.eventWrites
        .then(() => (this.eventsPath === eventsPath ? fs.appendFile(eventsPath, line, 'utf-8') : undefined))
        .catch((e: unknown) => logError(`error writing recording event:`, e));
}
```

- `startRecording()`: after `this.baseSeconds = …` set `this.eventsPath = this.filePath.slice(0, -RECORDING_EXT.length) + EVENTS_EXT;` and call `this.onRecordingChange(true)`.
- `stopRecording()`: `const eventsPath = this.eventsPath; this.eventsPath = null;` before `await this.inFlight`, then `await this.eventWrites;` before `finalize()`.
- `finalize()`: `this.eventsPath = null; this.onRecordingChange(false);`.
- `server.ts`: `gameRecorder.onRecordingChange = (on) => bots.setRecording(on);` and replace the task-28 placeholder with `(e) => gameRecorder.appendEvent(e)`.

**Verify:** `npx jest modules/server/src/recording/game-recorder.spec.ts` → all pass.

**Commit:** `feat(server): recordings keep bot decisions in a sidecar`

### 32. Serve and list the sidecar

**File:** `modules/server/src/recording/game-recorder.ts:38-48,240-258`, `modules/server/src/server.ts:167-182`, `modules/core/src/client/admin.ts:31-37`, specs beside each

Tests (in `game-recorder.spec.ts` and the existing server HTTP spec that covers `/recordings`; find it with `grep -rln "recordings/" modules/server/src --include=*.spec.ts`): `isRecordingFileName('a_1.events.jsonl')` true, `'../a.events.jsonl'` false, `'a.jsonl'` false; `GET /recordings/<base>.events.jsonl` → 200 with the lines; listing entry has `events: '<base>.events.jsonl'` only when the file exists; `stopRecording()` summary carries `events` likewise.

**Code:**

```ts
/** True for a plain recording or sidecar file name — no directory part, a known extension. */
export function isRecordingFileName(name: string): boolean {
    const ext = [RECORDING_EXT, EVENTS_EXT].find((e) => name.endsWith(e));
    return !!ext && name.length > ext.length && !/[/\\]/.test(name) && path.basename(name) === name;
}
export const isRecordingName = (name: string) => name.endsWith(RECORDING_EXT) && isRecordingFileName(name);
```

`RecordingSummary` / `RecordingInfo` gain `events?: string`. `summarizeRecording` callers set it when `fs.access(<base>.events.jsonl)` succeeds. The GET route uses `isRecordingFileName`.

**Verify:** `npx jest --selectProjects server core -t "recording"` → all pass.

**Commit:** `feat(server): serve and list recording sidecars`

### 33. Download links in the browser

**File:** `modules/browser/src/widgets/game-controls.ts:23-31,110-121`, `modules/browser/src/components/recordings-menu.tsx`

- `game-controls.ts`: `downloadRecording(name)` also downloads `name.replace(/\.sgr$/, '.events.jsonl')` when the `stopRecording` summary or a `HEAD recordings/<sidecar>` returns 200. The widget observes `recordingName` going empty (stop by button or by game stop), so use `fetch(href, { method: 'HEAD' })` and download only on `ok`. Second link `data-id="recording events download"`.
- `recordings-menu.tsx`: beside each recording button, when `r.events`, an anchor `<a href={`recordings/${encodeURIComponent(r.events)}`} download={r.events} data-id={`recording events ${r.name}`}>decisions</a>`.

Express's `HEAD` is served by the `GET` route — no server change.

**Verify:** `npm run test:types` → clean; covered end-to-end in task 50.

**Commit:** `feat(browser): download the decision sidecar beside its recording`

### 34. Phase 6 gate

**File:** none

**Verify:** `npx jest --selectProjects server core browser` → pass; `npm run test:types && npm run knip` → clean.

**Commit:** none.

---

## Phase 7 — Roster rewrite

Edge cases: a screen held by a disconnected (sticky) entry — shown as `○ <id>`; a client chosen in one screen dropdown that already holds another screen — `assignStation` moves it (server steals, `game-manager.ts:182-186`); choosing `— none —` unassigns the current holder; the ship list changing while a dropdown is focused — rows keyed by `ship/seat` and `stationId` are updated in place, never rebuilt (#2336); manifest fetch failing → screens of that ship show no dropdowns (as today's cache).

### 35. Pure roster model — failing spec

**File:** `modules/browser/src/widgets/station-roster-model.spec.ts` (new)

Pure function `rosterModel({ playerShipIds, stations, bots, enabledScreens })` → `{ ships: [{ shipId, seats: [{ seat, bot: { brain, status, message } | null, screens: [{ screen, holder: string | null }], unassigned: boolean }] }], unassignedClients: string[] }`. Cases: empty bridge → every seat `unassigned: true`; a client on `dradis` → sigint not unassigned, `holder` set; a bot on pilot → not unassigned; a screen not enabled in the manifest is omitted; a connected entry with no `shipId` is in `unassignedClients`, a disconnected one is not.

**Verify:** `npx jest modules/browser/src/widgets/station-roster-model.spec.ts` → fails (module not found).

**Commit:** none (commit with task 36).

### 36. Pure roster model — implementation

**File:** `modules/browser/src/widgets/station-roster-model.ts` (new)

**Code:**

```ts
import { BridgeSeat, rosterSeats, seatScreens } from '@starwards/core';

type Entry = { id: string; connected: boolean; shipId: string; stationType: string };
type Bot = { brain: string; status: string; message: string };

export function rosterModel(input: {
    playerShipIds: readonly string[];
    stations: Iterable<Entry>;
    bots: (shipId: string, seat: BridgeSeat) => Bot | undefined;
    enabledScreens: (shipId: string) => readonly string[];
}) {
    const entries = [...input.stations];
    const holderOf = (shipId: string, screen: string) =>
        entries.find((e) => e.shipId === shipId && e.stationType === screen) ?? null;
    return {
        ships: input.playerShipIds.map((shipId) => ({
            shipId,
            seats: rosterSeats.map((seat) => {
                const enabled = input.enabledScreens(shipId);
                const screens = seatScreens(seat)
                    .filter((screen) => enabled.includes(screen))
                    .map((screen) => ({ screen, holder: holderOf(shipId, screen) }));
                const bot = input.bots(shipId, seat) ?? null;
                return { seat, bot, screens, unassigned: !bot && screens.every((s) => !s.holder) };
            }),
        })),
        unassignedClients: entries.filter((e) => e.connected && !e.shipId).map((e) => e.id),
    };
}
```

**Verify:** `npx jest modules/browser/src/widgets/station-roster-model.spec.ts` → passes.

**Commit:** `feat(browser): roster model of seats, screens and bots`

### 37. Rewrite the roster widget around the model

**File:** `modules/browser/src/widgets/station-roster.ts`

Keep `stationRosterWidget`, `createManifestCache` (returns enabled screens per ship) and `syncOptions` (`station-roster.ts:96-113`). Replace `drawStationRoster`'s rows:

- Per ship a header `data-id="Roster Ship <shipId>"`; per seat a row `data-id="Roster Seat <shipId> <seat>"`, cells: seat label; bot `<select data-id="Roster Bot <shipId> <seat>">` with `[['none','none'], ...botBrains.map(b => [b, b])]`, value `bot?.brain ?? 'none'`, `change` → `adminDriver.assignBot({ shipId, seat, brain })`; status `<span data-id="Roster Bot Status <shipId> <seat>">` text `bot.status === 'running' ? '' : bot.status + (bot.message ? `: ${bot.message}` : '')`; per screen `<select data-id="Roster Screen <shipId> <screen>">` with `[['', '— none —'], ...clients]` where clients are every registry entry, text `${connected ? '●' : '○'} ${id}`, value `holder?.id ?? ''`, `change` → value ? `assignStation({ stationId: value, shipId, stationType: screen })` : `assignStation({ stationId: <previous holder>, shipId: '', stationType: '' })`.
- Row tint when `unassigned`: `row.css('background', unassigned ? hsl.warning.main(1) : '')` — check the palette name in `modules/browser/src/colors.ts` and use its existing warning/alert token; add `data-unassigned="true|false"`.
- Below the ships, `data-id="Roster Unassigned"`; per client a row `data-id="Roster Unassigned <stationId>"` with `<select data-id="Roster Unassigned Assign">` options `['', 'assign to…']` + every `(shipId, seat, screen)` as value `${shipId}|${screen}` text `${shipId} / ${seat} / ${screen}`; `change` → `assignStation`.
- Rows in maps keyed `ship|seat` and `stationId`, created once, removed when gone, never moved (comment the #2336 reason once, at the map).
- Re-render on `/stations`, `/stations/**`, `/playerShipIds`, `/bots`, `/bots/**`; `off` all on destroy.

Delete `pendingShipByStation` (no two-step ship→type pick remains).

**Verify:** `npm run test:types && npx eslint modules/browser/src/widgets/station-roster.ts` → clean.

**Commit:** `feat(browser): seat-first station roster with bot seats`

### 38. Update the station-registry e2e to the new roster

**File:** `modules/e2e/test/station-registry.spec.ts:65-71,90,142-199,211-237,265-269`

Rewrite each roster test to the new selectors: assigning now picks the client in `[data-id="Roster Screen GVTS helms"]` (`selectOption(stationId)`); moving to another ship picks it in `Roster Screen GVTS2 helms`; listing reads `Roster Unassigned <id>` rows for unassigned clients. Keep each test's intent (assign, move, steal, focused dropdown survives another station joining — #2336).

**Verify:** `npm run test:e2e -- modules/e2e/test/station-registry.spec.ts` → all pass.

**Commit:** `test(e2e): station registry against the seat-first roster`

### 39. Phase 7 gate

**File:** none

**Verify:** `npx jest --selectProjects browser` → pass; `npm run test:e2e -- modules/e2e/test/station-registry.spec.ts` → pass; `npm run test:format` → clean. If a GM-screen visual snapshot includes the roster, `npm run test:e2e -- --update-snapshots` and review the diff image before committing (`test(e2e): roster snapshots`).

**Commit:** none unless snapshots changed.

---

## Phase 8 — Removals and docs

### 40. Delete the crew CLI and the ai live path

**File:** delete `modules/ai/src/cli/crew.ts`, `modules/ai/src/live/live-crew.ts`, `modules/ai/src/live/live-crew.spec.ts`, `modules/ai/src/console/live.ts`; `modules/ai/package.json` (remove the `crew` script); `modules/ai/src/crew/crew-config.ts:64-86` (delete `HUMAN_SEATS`, the `humanSeat` parameter, its doc sentence and the `seatsOf` import).

**Verify:** `grep -rn "HUMAN_SEATS\|humanSeat\|liveCrew\|liveStation\|cli/crew\|run crew" modules --include=*.ts --include=*.json | grep -v node_modules` → only `modules/bots/src/live-station.ts` (`liveStation`) and the server's use of it; `npx jest --selectProjects ai` → pass; `npm run test:types` → clean.

**Commit:** `refactor(ai): drop the crew CLI; the server seats live bots`

### 41. Rewrite the single-seat playtest guide

**File:** `docs/guides/single-seat-playtest.md`

Rewrite around the roster: start a game, open the GM screen, in the station roster pick `reference` for every seat you do not play, attach your client to your seat's screens (or open the seat's screen from the lobby), record from game controls, download the `.sgr` and its `.events.jsonl` from game controls or the recordings menu, analyse with `npm --prefix modules/ai run decisions -- --recording <file>.sgr`. Delete every CLI flag and `--human-seat` mention.

**Verify:** `npm run lint:docs` → clean; `grep -n "run crew\|human-seat" docs/guides/single-seat-playtest.md` → nothing.

**Commit:** `docs: single-seat playtest through the GM roster`

### 42. Update ai-crew, INTEGRATION, README

**File:** `CLAUDE.md`, `docs/integration/ai-crew.md`, `docs/INTEGRATION.md:9`, `docs/README.md:29,68`, `modules/ai/README.md`, `docs/integration/mcp-server.md` (if it names `mcp/src/sandbox` paths)

- `ai-crew.md`: replace the live-crew/CLI section with "Live bots": seated from the roster, run by the server in one worker per ship, code in `@starwards/bots` shared with the curriculum; sidecar written by the server recorder. Fix every path that moved in phase 2.
- `INTEGRATION.md:9` and `README.md:68`: describe `@starwards/bots` beside `modules/ai`; `README.md:29` keep the guide link, text "playing one seat with bot crewmates seated from the GM roster".
- `CLAUDE.md`: Modules list gains `bots`; Build order becomes `core → bots → (server, browser, node-red, mcp in parallel)`, `ai` "ts-node scripts over core, bots and server source"; the fog-of-war paragraph's `modules/mcp/src/radar/radar-view.spec.ts` path follows wherever that spec landed in task 9.
- `grep -rn "mcp/src/sandbox\|mcp/src/radar\|mcp/src/readers\|mcp/src/contacts\|ai/src/brain/\(brain\|controls\|reference-policy\)\|ai/brains/.*v1" docs modules/*/README.md CLAUDE.md AGENTS.md .claude` → fix each to the bots path.

**Verify:** `npm run lint:docs` → clean; the grep above → nothing.

**Commit:** `docs: bot seats, the bots package and moved paths`

### 43. Phase 8 gate

**File:** none

**Verify:** `npm run knip` → no findings (unused exports from the moves, e.g. `seatsOf` if MCP is its last user, are deleted, not ignored); `npm run depcheck` → clean; `npm run test:types` → clean.

**Commit:** `chore: remove exports the move left unused` (only if knip forced changes).

---

## Phase 9 — Verification

Each test below lives in `modules/server/src/bots/bots-lifecycle.spec.ts` (new) unless stated; all use `makeDriver()` and a client `Driver` sending `assignBot`. Helpers in the spec:

```ts
const openConnections = async () => (await matchMaker.query({})).reduce((n, room) => n + room.clients, 0);
const botEntries = (m: GameManager) => [...m.state.bots.values()].reduce((n, s) => n + s.seats.size, 0);
const waitStatus = (admin: AdminDriver, ship: string, seat: string, status: string) =>
    waitFor(() => expect(admin.state.bots.get(ship)?.seats.get(seat)?.status).toBe(status), 15_000, 100);
```

The supervisor is reached in tests as `gameDriver.gameManager.botSeats as BotSupervisor`.

### 44. Toggle 20 times, 3 games: no growth

**File:** `modules/server/src/bots/bots-lifecycle.spec.ts`

Baseline `openConnections()` after the client connects; then 20× (`assignBot reference` → `running` → `assignBot none` → entry gone); then 3× (`startGame` → seat pilot+weapons → `running` → `stopGame()`). Expect: `workerCount === 0`, `botEntries === 0`, `openConnections()` equals baseline (poll up to 5 s — the server drops sockets asynchronously), `process.memoryUsage().heapUsed` after `global.gc?.()` within 20 % of the value after the first cycle (skip the heap check when `global.gc` is absent).

**Verify:** `npx jest modules/server/src/bots/bots-lifecycle.spec.ts -t "toggle"` → passes (expect ~2-3 min; set `jest.setTimeout(300_000)` in this describe).

**Commit:** `test(server): bot toggling and repeated games leak nothing`

### 45. Worker throw → failed, game keeps running

**File:** `modules/server/src/bots/bots-lifecycle.spec.ts`

Install a supervisor whose `source` returns `"require('node:worker_threads').parentPort.once('message', () => { throw new Error('boom'); })"` (constructor parameter from task 27) as `manager.botSeats`; assign pilot and weapons on one ship → both `failed` with message containing `boom`; `gameStatus === RUNNING`; `manager.update` still advancing `totalSeconds`; after 2 s `workerCount === 0` (no restart). Then restore the real supervisor and re-choose `reference` → `running`.

**Verify:** `npx jest modules/server/src/bots/bots-lifecycle.spec.ts -t "throw"` → passes.

**Commit:** `test(server): a crashing bot worker fails its bots, not the game`

### 46. Game stop clears every bot

**File:** `modules/server/src/bots/bots-lifecycle.spec.ts`

Two ships, three seats each, `running`; `POST /stop-game` (via `admin.stopGame()` then poll `gameStatus === STOPPED`) → `workerCount === 0`, `admin.state.bots.size === 0`.

**Verify:** `npx jest modules/server/src/bots/bots-lifecycle.spec.ts -t "stop"` → passes.

**Commit:** `test(server): stopping the game stops every bot`

### 47. Client attach keeps the bot

**File:** `modules/server/src/bots/bots-lifecycle.spec.ts`

Bot on pilot `running`; a second `Driver` registers as station `HUMAN1` type `helms` with `shipId` (`admin.registerStation`) and the GM `assignStation({ stationId: 'HUMAN1', shipId, stationType: 'helms' })` → after 5 s the pilot bot is still `running`, a new `decision` reaches the recorder sidecar (start a recording first), and `state.stations` has no id starting `BOT-`.

**Verify:** `npx jest modules/server/src/bots/bots-lifecycle.spec.ts -t "attach"` → passes.

**Commit:** `test(server): a human on a bot's seat leaves the bot playing`

### 48. Late recording gets events; none after stop

**File:** `modules/server/src/bots/bots-lifecycle.spec.ts`

Seat pilot, wait `running`, wait 3 s, `startRecording()`, wait 5 s, `stopRecording()`, wait 3 s. Sidecar exists; every line parses (`parseEventLine`); kinds include `brain_request` and `decision`; `max(t) ≤ summary.durationSeconds + 1`; file size unchanged between the moment `stopRecording` resolved and 3 s later.

**Verify:** `npx jest modules/server/src/bots/bots-lifecycle.spec.ts -t "recording"` → passes.

**Commit:** `test(server): sidecar covers exactly the recorded span`

### 49. Load: tick p95 within 10 %

**File:** `modules/server/src/bots/bots-load.spec.ts` (new)

Start `two_vs_one`; if it has fewer than 3 player ships add one with `gameManager.scriptApi.addPlayerSpaceship(...)` (construct the `Spaceship` the way `modules/server/src/maps.ts` does). Wrap `gameManager.update` to time each call with `performance.now()`. Measure 60 s with no bots → p95 A; seat all four roster seats on all three ships, wait all `running`, measure 60 s → p95 B. `expect(B).toBeLessThanOrEqual(A * 1.1)`. Kept out of the default `npm test` run (two minutes, timing-sensitive): `const run = process.env.STARWARDS_LOAD ? describe : describe.skip;`.

**Verify:** `STARWARDS_LOAD=1 npx jest modules/server/src/bots/bots-load.spec.ts` → passes; record A and B in the PR description. If it fails, stop and report the numbers before optimising (radar limit, poll interval).

**Commit:** `test(server): bots stay within the tick budget`

### 50. E2E: roster → bot seated → status

**File:** `modules/e2e/test/bot-seats.spec.ts` (new)

Following `station-registry.spec.ts` setup (`makeDriver(test)`, `startGame(two_vs_one)`, open the GM screen as that spec does): select `reference` in `[data-id="Roster Bot GVTS pilot"]` → `[data-id="Roster Bot Status GVTS pilot"]` shows `starting` then empty (running) within 15 s, row `data-unassigned="false"`; select `none` → row `data-unassigned="true"`. Start recording via game controls, wait 5 s, stop → two downloads (`page.waitForEvent('download')` twice): `.sgr` and `.events.jsonl`.

**Verify:** `npm run test:e2e -- modules/e2e/test/bot-seats.spec.ts` → passes.

**Commit:** `test(e2e): GM seats a bot from the roster`

### 51. Full suite and Docker image

**File:** none

**Verify:**
- `npm run test:types` → 0 errors
- `npm run test:format` → clean
- `npm run knip` → clean
- `npm test` → all projects pass
- `npm run test:e2e` → pass (snapshots unchanged or reviewed)
- `docker build -t starwards-bots-check .` → succeeds; `docker run --rm -e STARWARDS_BOT_SELFTEST=1 -e PORT=8080 starwards-bots-check` → `bot worker selftest: ok`, exit 0 (check the image's start command in `Dockerfile` and pass the env the same way)
- `npm --prefix modules/ai run suite -- --crew crews/reference.json --levels L0` → same verdicts as task 6

**Commit:** none.
