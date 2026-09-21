# Recording analysis

A training run produces a `.swr.jsonl` recording and a one-row `TrainingResult`. Neither answers
"what happened" or "why did it go wrong": the result is a handful of end-of-run scalars computed
inline in the run loop, and the recording is thousands of multi-KB gzipped snapshots nobody can
read. The two open T0 mysteries (PLAY_DEAD target drifts tens of km; GVTS strips armor but never
kills — `starwards-design/product/backlog.md`, *Simulation harness*) are unanswerable with either.

This spec adds an analysis layer to the training harness: decode a recording once into a
columnar store, derive an event log and invariant checks deterministically, and expose a small
CLI an investigator — human or LLM — queries in a few KB of tokens instead of reading frames.

## Goals

1. Any question about a recorded run is answerable through the CLI without decoding frames by hand.
2. "What went wrong" starts from a list of failed checks, not from an LLM reading state.
3. `TrainingResult` scalars and the analysis extractors are one code path.
4. Analysis is re-runnable on old recordings when extractors or checks change.
5. Two recordings sharing a prefix (a branched run) can be diffed.

## Non-goals

- An MCP server. The CLI's JSON output is the agent interface.
- A new repo or module. This lives in `modules/server`.
- Changing the recording format. Analysis reads `version: 1` files as written by `GameRecorder`
  and `HeadlessRecorder`.
- Recording bot intent or commands. Snapshots are state-only today; see *Forward compatibility*.
- Analysis inside the run loop. Recording stays cheap; analysis runs after.

## Inputs

A `.swr.jsonl` file: header line (`RecordingHeader`: `mapName`, `startedAt`, `intervalMs`, and
for headless runs `seed`, `params`), then frame lines `{ t, frame }` where `frame` is
`schemaToString(SavedGame)` — gzip+base64 of `{ mapName, fragment: { ship: Map<ShipState>,
space: SpaceState } }`. Decoding uses `parseHeader` / `parseFrameLine` from
`recording/recording-format.ts` and `stringToSchema(SavedGame, …)` from
`serialization/game-state-serialization.ts`; nothing in this spec re-implements the format.

## Layout

```
modules/server/src/test/training/
  analysis/
    decode.ts        recording → row stream (flatten SavedGame to (t, object, path, value))
    store.ts         DuckDB file: create, ingest, query helpers
    events.ts        derived event log
    checks.ts        invariant checks (the "what went wrong" list)
    extract.ts       scalar extractors shared with TrainingResult
    dictionary.ts    path → { meaning, unit, since } for the paths analysis cares about
    cli.ts           `npm --prefix modules/server run analyze -- <cmd> …`
```

`training-scenarios.ts` stops computing `armorStrippedAt`, `secondsFiring`, `meanDistance`,
`targetDrift`, `gvtsSpeed`, `shellsFired` inline. When recording is on, `runTraining` calls
`extract.ts` on the finished store; when off (`--interval 0`), the same extractors run on an
in-memory row stream fed from the live game each tick. One implementation, two feeders.

## Store

One DuckDB file per recording, `<name>.swr.duckdb`, beside the recording. DuckDB over SQLite
for columnar scans and window functions; it is a `modules/server` devDependency — verify the
native binary installs on the Windows host and in CI before the first commit.

Tables:

| Table      | Columns                                                          | Notes                                                                                          |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `run`      | `run_id, map_name, started_at, interval_s, seed, params_json, hz, format_version, frame_count, duration_s` | One row. `hz` from header when present (see *Forward compatibility*), else `null`. |
| `frame`    | `run_id, frame_no, t`                                            |                                                                                                |
| `object`   | `run_id, object_id, type, first_t, last_t, role`                 | `type` is the `SpaceObject` discriminator. `role` from scenario (`player`/`target`) when known. |
| `value`    | `run_id, object_id, path, t, num, str, bool`                     | **Delta-encoded**: a row only when the value differs from the previous frame. First frame writes all. One of `num`/`str`/`bool` is non-null. |
| `event`    | `run_id, t, kind, object_id, source, detail_json`                | `source` ∈ `derived` \| `recorded`. See *Event log*.                                           |
| `check`    | `run_id, name, status, t, detail_json`                           | `status` ∈ `pass` \| `fail` \| `skip`. See *Checks*.                                           |

`path` is the JSON-pointer-style path inside the object (`/armor/armorPlates/3/health`,
`/chainGuns/0/isFiring`, `/position/x`), matching the repo's addressing scheme
(`docs/json-ptr.md`) so paths in analysis output are the same strings a GM tweak or a command
would use. Ship subsystem state (`fragment.ship[id]`) and space state (`fragment.space` objects)
flatten into the same `value` table keyed by `object_id`; a ship has both.

`run_id` is a first-class column from day one so several stores can be `ATTACH`ed and joined
for cross-run and branch diffs without a schema change.

Delta encoding assumes `object_id` is stable across frames within a run; it is (ids are assigned
at spawn and never reused within a process — `makeId` is a process-wide counter). Cross-run id
stability is **not** assumed; cross-run joins use `role`.

Reading a delta-encoded value at time `t` is `last value with t' ≤ t` (`ASOF JOIN` or a window
`last_value` over `t`). `store.ts` exposes `valueAt(object, path, t)` and
`series(object, path, t0, t1)` so callers never write that join by hand.

## Event log

Deterministic, derived from `value` deltas after ingest. Every event carries `t`, `kind`,
`object_id`, `source = 'derived'`, and a `detail_json` naming the paths and values it was derived
from — an event is evidence only insofar as its inputs are.

Initial kinds:

| kind                  | Trigger                                                            |
| --------------------- | ------------------------------------------------------------------ |
| `spawn` / `despawn`   | object first/last seen                                             |
| `destroyed`           | `/destroyed` false → true                                          |
| `health_threshold`    | `/healthRatio` crosses 0.75 / 0.5 / 0.25 / 0.05 downward           |
| `plate_broken`        | `/armor/armorPlates/N/health` reaches 0                            |
| `armor_stripped`      | last plate broken                                                  |
| `fire_start` / `fire_stop` | `/chainGuns/N/isFiring` edges                                 |
| `ammo_empty`          | any `/magazine/count_*` reaches 0                                  |
| `system_broken` / `system_repaired` | any `SystemState.broken` edge                        |
| `velocity_spike`      | speed delta between consecutive frames exceeds a threshold (parameter; default 3× the run's median per-frame speed delta for that object) |
| `proximity`           | distance between two role-tagged objects drops below a threshold (parameter) |
| `range_band`          | player–target distance crosses a configured band edge              |

Thresholds are parameters of `events.ts`, recorded into `detail_json`, so a re-run with
different thresholds is distinguishable.

`velocity_spike` and `proximity` exist specifically for the drift mystery: a spike coincident
with a `fire_start` window points at knock-back; coincident with `proximity` points at collision;
neither points at PLAY_DEAD not holding.

## Checks

A check is a named predicate over the store that returns `pass`, `fail` (with the `t` and detail
that fails it), or `skip` (inputs absent — e.g. no target role). Checks are the harness's
acceptance criteria and the investigator's starting hypotheses. They are expressed in
sim-seconds, never frame counts, because frame interval and tick rate vary between runs.

Initial set, all scoped to a `player` and a `target` role:

| name                        | fails when                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `target_holds_position`     | target with `PLAY_DEAD`-class order moves more than *D* m from spawn (default 500)                   |
| `fire_within_range`         | any `fire_start`–`fire_stop` window where mean distance exceeds the gun's effective range           |
| `shells_damage_armor`       | over any window with ≥ *N* shells fired (default 200) at ≤ *R* m, total plate health delta is 0    |
| `strip_leads_to_kill`       | `armor_stripped` at `t` but no `destroyed` by `t + T` (default 60 s) while firing continues         |
| `player_stays_mobile`       | player speed at end is 0 with no `system_broken` event on propulsion                                |
| `frames_regular`            | frame `t` gaps deviate from `interval_s` by more than 1 frame                                        |

`shells_damage_armor` and `fire_within_range` together separate hit-rate from
damage-past-armor — the split the backlog says must precede any balance number.

Adding a check is one function in `checks.ts` plus a row in the CLI's `checks --list` output.
Checks never read frames; they read the store.

## CLI

`npm --prefix modules/server run analyze -- <command> [options]`. All commands take
`--store <file>` (or `--recording <file>`, which ingests first if the store is missing or older
than the recording). Output is JSON on stdout; `--md` renders a markdown table for humans.

| command                                   | returns                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ingest --recording <f> [--roles p=<id>,t=<id>]` | builds the store; runs events and checks                                                            |
| `summary`                                 | `run` row, object list with roles, check results, event counts by kind — the one call an investigator starts with (target ≤ 2 KB) |
| `events [--kind k,…] [--object id] [--t0 --t1]` | filtered event rows                                                                                  |
| `checks [--list] [--only name]`           | check rows, or the catalogue with parameters                                                               |
| `series --object <id> --path <p> [--t0 --t1] [--step s] [--agg mean\|min\|max\|last]` | downsampled series plus `min/max/argmin/argmax` over the window. Refuses to return more than 500 points; raise `--step` |
| `at --t <s> [--object id] [--path prefix]` | resolved values at `t` (delta-aware)                                                                       |
| `diff --t0 <s> --t1 <s> [--object id]`    | paths whose value changed between two instants, with both values                                           |
| `diff --other <store> --from <s>`         | branch diff: per-path first divergence time and magnitude between two runs sharing a prefix                |
| `dictionary [--path prefix]`              | `dictionary.ts` entries — meaning and unit per path                                                        |
| `sql "<query>"`                           | escape hatch; read-only                                                                                    |

Every command's output is bounded: `summary` and `checks` are fixed-size, `events` and `series`
are paginated or downsampled. An investigator that needs more than the bound is asking the wrong
question and should narrow it.

`run-training.ts` gains `--analyze` (default on when recording): after each run it ingests the
recording and appends the failed-check names to the report row. The markdown report's per-seed
table is generated from `extract.ts` output, not from `TrainingResult` fields computed in the
loop.

## Investigation skill

`.agents/skills/starwards-recording-analysis/SKILL.md` (per repo convention). Content: the
`dictionary` output for the roles' key paths; the procedure — `summary` → pick a failed check →
`events` around its `t` → at most three `series` calls → verdict with evidence paths; the output
contract — every claim cites `(object, path, t)` rows or event ids, and states whether it is a
read value or an inference. No harness code lives in the skill.

A Sonnet-class model with the dictionary in context and this procedure is the intended
investigator. Larger models are for failure classes the checks do not yet name; when one is
found, it becomes a check.

## Acceptance

The tool is accepted when, on the existing T0 corpus (64 seeds, 300 sim-s, 1 s interval), an
investigator following the skill procedure can:

1. For the drift mystery, rank knock-back / collision / order-not-holding per seed with cited
   `velocity_spike`, `proximity`, and `fire_*` events — and the ranking agrees with a human reading
   of three hand-checked seeds.
2. For the no-kill mystery, report per seed whether `fire_within_range` or `shells_damage_armor`
   fails, so the hit-rate vs damage-past-armor split is a table, not a guess.
3. Do both from `summary` + ≤ 3 `series` calls per seed, within 8 K tokens of tool output per seed.

If (1) cannot discriminate the candidates on the corpus, the event set is wrong and the spec is
revised before the CLI grows.

## Forward compatibility

Items in the backlog's *Simulation harness* section, and what each means for this tool when it
lands:

- **Automation private state / `SpaceManager` maps / map-script state added to the snapshot.**
  New paths appear in `value` automatically — `decode.ts` flattens whatever `SavedGame` contains
  and hardcodes no path list. `dictionary.ts` gains entries with `since: <format version>`.
  Checks that need bot intent (e.g. "engaged but not firing") are added then, not stubbed now.
- **Engine-side cause of death.** Becomes a `source = 'recorded'` event; `destroyed` (derived)
  stays. Checks prefer the recorded one when present.
- **Tick-rate dependence.** `hz` belongs in `RecordingHeader` (a one-field addition to
  `HeadlessRecorder`'s header; `GameRecorder` writes the Colyseus interval). Until then `run.hz`
  is null and checks that would depend on it `skip`. Nothing in checks is expressed in frames.
- **Determinism / exact resume.** `diff --other` is the instrument for measuring it (per-path
  first divergence time replaces the hand-measured "~10 m off after 5 s"). Once resume is exact,
  the same command is the branch-comparison tool the harness exists for.
- **Seeded randomness / per-game `makeId`.** Enables cross-run joins on `object_id`; until then
  `role` is the join key and the CLI refuses `--object` across runs without a role.
- **Command/action recording (not in the backlog; recommended).** A second line kind in the
  recording, `{ t, cmd }`, would let the tool answer *why* the bot acted, not only *what* changed.
  Out of scope here; the `event` table's `source` column already accommodates it.

## Testing

- **decode**: a fixture recording (3 frames, 2 objects, one value changing) flattens to the
  expected `value` rows; delta encoding emits no row for an unchanged value; a truncated tail
  line is dropped, not thrown.
- **store**: `valueAt` returns the last-written value across a gap; `series --step` downsamples
  with correct `argmin`/`argmax`.
- **events**: each kind has a fixture that fires exactly once; thresholds appear in `detail_json`.
- **checks**: each check has a passing and a failing fixture; a check with missing roles returns
  `skip`, not `fail`.
- **extract**: on a recorded T0 run, `extract.ts` scalars equal the values the deleted inline
  loop code produced for the same seed (one-time parity fixture captured before deletion, then
  the inline code goes).
- **cli**: `summary` on the fixture is under 2 KB; `series` refuses > 500 points.
- **integration**: `run-training --seeds 1 --analyze` produces a store and a report row with
  check names; the store opens and `summary` runs.

## Open

- Store per recording vs one store per training batch. Per recording is simpler and matches
  the file-beside-file layout; a batch store makes cross-seed queries one `SELECT`. Start per
  recording; `ATTACH` covers the batch case until it doesn't.
- `velocity_spike` default threshold is a guess; calibrate on the T0 corpus before acceptance.
