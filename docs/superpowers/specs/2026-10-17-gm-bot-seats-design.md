# GM-assigned bot seats — design

Date: 2026-10-17. Status: draft for approval.

## Intent

AI bots become an integral part of the game product. The GM puts a bot on a bridge seat from the same **station roster** pane they use to assign web clients, with nothing else to launch. The roster becomes the GM's at-a-glance view of the whole bridge: every seat of every player ship, who (or what) is on it, and which seats nobody covers.

The bots are the rule-based `reference` policy (`modules/bots/src/brain/reference-policy.ts`) — playable bots, not only a training control. Jev brains come later; the UI must already be shaped for a brain choice.

## Vocabulary

- **Seat** — a player/AI role on a ship: `pilot`, `engineer`, `weapons`, `sigint`. A bot plays a whole seat.
- **Screen** — what one web client shows; today's manifest station names (`helms`, `weapons`, `engineer`, `signals`, `dradis`, `target-details`). A human playing a seat may need several clients, one per screen. A screen is never a seat (Amir): `target-details` is a screen of `sigint`.
- Seat → screens:

  | Seat | Screens |
  |---|---|
  | pilot | helms |
  | weapons | weapons |
  | engineer | engineer |
  | sigint | signals, dradis, target-details |

  The user calls the third sigint screen "target-info"; in code it is the `target-details` manifest station (the `target-info` widget lives inside `signals`).

- **Bot id** — `bot-<seat>-<n>`, e.g. `bot-sigint-23` (Amir); `n` is a server-wide counter, so ids never collide across ships or restarts within a server run. The longest, `bot-engineer-<n>`, fits the 16-char station-id limit up to n = 999; the builder either keeps that bound or widens the limit.

The GM seat/screen is out of scope.

## Goals

1. Roster shows, per player ship, one row per seat, with:
   - a **bot** dropdown: `none` (default), `reference`; Jev entries are added later without changing the UI;
   - one client dropdown per screen of the seat (`— none —` or any connected client), to attach / move / detach a client;
   - a clear **UNASSIGNED** marker (e.g. tinted row) when the seat has no bot and no client on any of its screens;
   - the bot's status when it is not simply running (starting, failed).
2. Roster lists **unassigned connected clients**, each with an "assign to ship / seat / screen" dropdown.
3. Choosing a bot makes the **server** start a bot on that seat; choosing `none` stops it.
4. A human screen may be attached to a seat a bot holds. Input is **shared** (no blocking either way); the intended use is viewing. Attaching a client never removes the bot; choosing a bot never detaches clients.
5. Bot choices **reset to `none`** when the game stops / restarts / loads. Player ships are never destroyed, so there is no ship-loss case.
6. While the server is **recording**, bot decisions are written to the sidecar `<recording>.events.jsonl` in the **same format** the CLI crew writes today (`brain_request`, `decision`, `command`, `callout`, `brain_error`). No recording → no sidecar. A bot seated before recording starts begins writing when it starts; events after recording stops are dropped.
7. When a recording ends, the sidecar is **downloadable together with the `.sgr`**: wherever the GM gets a recording today (game controls, recordings menu), the sidecar is offered beside it.
8. The **reference crew lives in one neutral package** used by both the live server bots and the headless AI curriculum, so improving it once improves both (Amir). See *Code layout*.
9. Remove the `npm run crew` CLI (`modules/ai/src/cli/crew.ts`), its script, and the CLI-only seat plumbing (`HUMAN_SEATS`, `loadCrew`'s `humanSeat`); update every doc that references the CLI (at least `docs/guides/single-seat-playtest.md`, rewritten around the roster; `docs/integration/ai-crew.md`; `docs/INTEGRATION.md`; `docs/README.md`).

Approved mockup: seat-first table — columns *seat | bot | screens*, unassigned-clients list below (brainstorm v3).

## Non-goals

- Jev brains in the dropdown (later; only the control's shape is in scope).
- Blocking human input on bot-held seats, or bot yielding to a human.
- Wires / node-graph UI.
- GM seat.
- New brain logic (e.g. for dradis or target-details).

## Anti-goals

- A bot crashing or stalling must not stall or crash the game server's tick.
- Bots must not see more than a human at that seat (fog of war): they read through the same station-session layer the MCP uses.
- Bots must not appear as "clients" the GM could assign elsewhere.
- Two copies of the reference crew that drift apart (one for live, one for training).

## Current state (evidence)

- Roster widget: `modules/browser/src/widgets/station-roster.ts` — one row per registered client (`AdminState.stations`), ship + station-type dropdowns, sends `assignStation`; rows updated in place to keep focused dropdowns alive (#2336).
- Registry entry: `{ id, connected, shipId, stationType }` (`core/src/stations/entry.ts`). `GameManager` drains `registerStation` / `assignStation` in `update()`; `isValidStationSlot` = player ship + `isAssignableSeat(manifest entry)`; a GM assignment steals the slot from its holder (`game-manager.ts:171-190`); `reconcileStationAssignments` auto-assigns an unassigned typed entry when exactly one ship fits (`:228-246`). Station ids are `[A-Z0-9-]`, max 16 chars (`core/src/stations/registry.ts`).
- `AdminRoom` keeps one station id per connection; a second `registerStation` on the same connection is a rename (`server/src/admin/room.ts:77-84`).
- Manifest: same for every ship (`server/src/stations-manifest.ts`). The only seat grouping is MCP's `multiplexedStations = { tactical: ['helms','weapons'] }` (`mcp/src/sandbox/multiplex.ts`).
- Live bots today: `liveCrew` (`ai/src/live/live-crew.ts`) runs a fixed set of seats on one `Driver`, takes a `write(event)` callback and a `record` flag fixed at construction; `liveStation` (`ai/src/console/live.ts`) registers each seat as `ai-<seat>` on that Driver — which, given the rename rule above, leaves only the last seat registered.
- Recording: HTTP `POST /start-recording`, `/stop-recording`; files in `STARWARDS_RECORDINGS_DIR`; `GET /recordings/:name` and the recordings listing accept only `.sgr` (`isRecordingName`, `game-recorder.ts:41-48`). `/stop-game` stops the recording before the game (`server.ts:132-135`); `finalize()` zeroes `recordingSeconds`. `EVENTS_EXT` exists in core; `GameRecorder` has no sidecar; the test-only `headless-recorder.ts` writes a sidecar beside its recording.
- Lifecycle: no "game over" event; `state.gameStatus` (STOPPED → STARTING → RUNNING → STOPPING) is the signal.
- Packages: `@starwards/ai` depends on server and mcp and imports server **test** sources (`headless-game`, `headless-recorder`); `@starwards/mcp` lists server as a dependency but uses it only in specs; the server imports neither. The brain stack (`ai/src/brain/*` minus Jev, `ai/src/whatif/*`, `ai/src/crew/channel.ts`) imports only core, zod and node built-ins; the MCP station-session layer (`mcp/src/sandbox/{session,console,multiplex,command-map}.ts`, `mcp/src/radar/radar-view.ts`, `mcp/src/readers.ts`, `mcp/src/contacts.ts`, ~1100 lines) imports only core and zod.
- Production: one esbuild CJS bundle of `server/src/prod.ts` (`scripts/bundle-server.js`) copied alone into the runtime image (`Dockerfile`); a Node single-executable (SEA) build also exists (`server/src/app-paths.ts`).

## Decided how

- **Server owns bots.** Started/stopped from the roster, not from a CLI. (Amir)
- **Bots are not station-registry entries.** A bot never calls `registerStation` and never holds a screen slot. Bot state lives in its own synced `AdminState` field, keyed by ship and seat: `{ id, brain, status }`, status `starting | running | failed` (+ message). This is what makes goal 4 hold (the steal and reconcile rules never touch bots), keeps bots off the unassigned-clients list, and leaves nothing for a browser client to spoof. Station registration in the session layer becomes optional so the live bot path skips it.
- **One worker thread per ship (Amir).** All of a ship's bots run in one `worker_threads` Worker inside the server process, off the game loop, connecting to the server on localhost with one `Driver`. Its own event loop, so slow brain code cannot stall the tick; an uncaught error surfaces as the Worker's `error` event instead of crashing the server; `resourceLimits` caps its heap; and a worker cannot outlive the server.
- **Worker code ships as a second bundle.** The production bundle step gains a second esbuild entry for the bot worker. Because the SEA build has no files on disk, the worker bundle is embedded in the server bundle as a string and started with `new Worker(code, { eval: true })` (or an equivalent that works in both the plain bundle and SEA). In dev it loads from source. *First task of the build: a spike proving the worker starts and connects in the dev server, the production bundle and the SEA build. If it cannot work under SEA, stop and come back to Amir — the fallback is `fork(__filename)` with a role flag, the pattern `server/src/test/training/run-training.ts` uses.*
- **Live crew logic is cloned into the server module and adapted (Amir).** `liveCrew` / `liveStation` become a server-side ship-crew runner: seats added and removed while running; the record flag switches on and off while running; no station registration; reports status to the server. The ai module's `liveCrew` / `liveStation` / CLI are removed (goal 9).
- **Server writes the sidecar.** The worker posts its events to the server (`postMessage`); the server stamps them on its own recording clock and appends them beside the `.sgr`, inside the recorder that already owns the recording's file and lifetime. Closing the recording closes the sidecar; late events are dropped. No file handle lives in the worker.
- **Seat table in core.** The seat → screens table lives in core next to the manifest, so browser, server and the neutral package agree. MCP's `multiplexedStations` becomes rows of the same table (`tactical` stays as a bot-only combined seat), so there is one table, not two that must agree.

## Code layout

Neutral package for the crew (my call on the name and boundaries; Amir asked for "a neutral place"):

- **New workspace package `modules/bots` (`@starwards/bots`)**, depending only on core (and zod). It holds:
  - the brain stack: `buttonBrain`, controls, catalogue, callouts, request, spec, verbal, what-if forecasts, the crew channel;
  - the **reference crew**: `reference-policy.ts` and the scripted variants it parameterises;
  - the station-session layer moved from mcp (session, console reads, multiplex, command map, radar view, readers, contacts);
  - the brain spec files the reference crew uses (`brains/*.v1.json`, or whichever versions the reference seats load) and the reference crew files.
- **Consumers:**
  - `@starwards/server` — the bot worker and ship-crew runner (no dependency on ai or mcp).
  - `@starwards/ai` — the headless curriculum (`headlessCrew`, `train`, `bench`, `suite`) imports the same brain stack and reference crew from `@starwards/bots`. Jev client, training, scoring, benchmarks and brain versions beyond what the reference needs stay in ai.
  - `@starwards/mcp` — imports its session layer back from `@starwards/bots`; its LLM-facing tools stay in mcp.
- No package cycles: core ← bots ← {server, mcp, ai}. mcp's `@starwards/server` dependency moves to `devDependencies` (spec-only use) or the specs move.
- `@starwards/bots` builds like core (compiled output consumed by the server bundle and by ai), so production needs no ts-node.

A headless curriculum run after this change exercises exactly the reference code the live game runs; changing the reference in `@starwards/bots` changes both.

## Engineering concerns

These are requirements on the build, not suggestions. Where a choice is mine it says so.

### Leaks

- **Workers.** The server keeps a registry of its ship workers and stops a ship's worker on STOPPING, when the ship has no bots left, and on its own `close()`. No worker survives a finished game.
- **Graceful stop before terminate.** Stopping a worker first asks it to stop (message), lets the crew runner drain in-flight decisions and held buttons and close its `Driver`, then terminates after a timeout. A bare `terminate()` would leave the bots' socket sessions open on the server until they time out.
- **Bot state.** Every bot entry in `AdminState` is removed (seat back to `none`) when its bot stops, and all of them on game stop.
- **Repeated toggling.** Switching a seat between `none` and `reference` many times, or running many games in a row, must not grow worker count, open sockets, `AdminState` size or memory.

### Sharing resources between bots

- **One worker and one `Driver` per ship**, not per seat: one set of Colyseus connections (admin, space, ship rooms). Also required for correctness: bots hear each other's callouts through the crew channel, which works only within one crew.
- **Dynamic seats.** The crew runner adds and removes seats while running, so toggling one seat never restarts its crewmates.
- **Shared per-worker services.** The radar view, the stations manifest fetch and (later) the Jev client and its answer cache are shared by every seat in the worker. A later Jev rate limit is shared across ships (one API key): the server, not each worker, owns that budget.
- **Load budget.** Each worker decodes the full space state over its connections, and each decision reads up to 200 radar contacts. Requirement: with three player ships fully crewed by bots, the server tick's p95 stays within 10 % of the same game with no bots. Measured, not assumed.
- **Heap cap.** Each worker runs with `resourceLimits`; hitting it ends that worker as a failure (below), not the server.
- **Worker startup.** Start the ship's worker on its first bot and keep it until the ship has no bots or the game stops (my call). The GM sees a bot seated within a couple of seconds of choosing it.

### Failure handling

- **Brain errors** are recorded (`brain_error`) and the seat keeps playing, as today.
- **Worker crash** (uncaught error, heap cap, exit): the server marks that ship's bots `failed` with the message; the roster shows it. No automatic restart loop; the GM can choose the bot again (my call).
- **Server under load.** A bot that falls behind skips decisions; it does not queue them.

### Observability

- Worker logs go to the server log, prefixed with ship and bot id.
- Bot status in `AdminState` is the debugging view of which ships run bots and in what state.

### Tests for these

- Toggle a seat's bot 20 times and run 3 games back to back: worker count, `AdminState` bot entries and open connections return to baseline.
- Throw inside a bot worker: that ship's bots show `failed`, the game keeps running.
- Stop a game with bots seated: every worker is gone and every seat is `none`.
- Attach a client to a bot-held seat: the bot keeps playing and stays `running`.
- Recording started after a bot was seated: the sidecar has that bot's events; events after stop are absent.
- Headless curriculum suite still passes against `@starwards/bots` (same results as before the move).
- E2E: roster bot dropdown → bot seated → status shown. (E2E runs against the built server, so the worker bundle is a prerequisite.)

## Left to the builder

- Wire protocol for bot assignment (new admin command, e.g. `assignBot { shipId, seat, brain }`) and the exact `AdminState` schema.
- How the sidecar download is offered in the UI (second link, or an archive), within goal 7.
- How a sigint bot opens three screens through the seat table (reference logic acts on signals only).
- Exact file moves into `@starwards/bots` and import rewrites.

## Settled after review

- **Bot lifetime = one game (my call).** On STOPPING every bot worker is stopped and every seat's bot resets to `none`; a new game needs a fresh GM choice. No reconnect logic.
- **Sigint bot scope (my call).** The bot acts where the reference policy has logic (signals beam). It holds the whole sigint seat for roster purposes; dradis and target-details get no new brain logic.
- **Not persisted (my call).** Bot choices are never written to a save or snapshot.
- **Production is in scope (Amir).** Bots work in the production image, on deployed previews and in the SEA build.

## Open questions for Amir

None.
