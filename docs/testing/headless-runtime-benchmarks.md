---
audience: agent
depth: deep
source_of_truth:
  - modules/ai/build-cli.mjs
  - modules/ai/package.json
related:
  - ../../.claude/skills/starwards-brain-training/SKILL.md
last_verified: 2026-10-18
---

# Headless runtime benchmarks

Whether another JavaScript engine, a precompiled CLI or V8 flags make headless training and
branching cheaper. Measured 2026-10-18 on the 16-core Windows host.

## Workload and method

- **train**: `train --scenario T3-directed --seeds 4 --crew crews/captain-reference.json --workers 4`
- **corpus**: `branch corpus` over the train output above (recorded once, under Node), `--budget 12 --workers 4`
- Three interleaved repetitions per configuration. A PowerShell poller sampled the process tree
  every 250 ms for CPU seconds and per-process peak working set.
- Correctness signature: run results without wall-clock fields, every `.events.jsonl`, `.sgr`
  frames (the header carries `startedAt`), and the sorted `branches.jsonl` rows.

Other agents loaded the host throughout (≈70 % CPU), so wall time varied up to 2× between
repetitions. Read the minimum columns. A difference under ~15 % is noise.

## Results

| Runtime / setting                         | train wall min (s) | train CPU min (s) | train peak RSS / worker (MB, median) | corpus wall min (s) | corpus CPU min (s) | corpus peak RSS / worker (MB, median) | identical to Node |
| ----------------------------------------- | ------------------ | ----------------- | ------------------------------------ | ------------------- | ------------------ | ------------------------------------- | ----------------- |
| Node 24, ts-node transpile-only (current) | 16.6               | 71.9              | 612                                  | 28.8                | 137.7              | 796                                   | baseline          |
| Node 24, esbuild bundle (`train:js`)      | 20.9               | 67.0              | 579                                  | 29.6                | 136.3              | 659                                   | yes               |
| Node 24, bundle + `--max-semi-space-size=64` | 18.7            | 71.5              | 551                                  | 48.9                | 172.3              | 652                                   | yes               |
| Bun 1.4.3, TypeScript source              | 15.5               | 67.9              | 349                                  | 45.6                | 178.7              | 544                                   | **no**            |
| Bun 1.4.3, bundle                         | 16.2               | 64.7              | 328                                  | 37.0                | 160.3              | 577                                   | **no**            |
| Deno 2.9.7, bundle as `.cjs`              | 14.1               | 55.6              | 470                                  | 47.9                | 196.3              | 898                                   | **no**            |

No configuration is faster beyond noise. Bun uses roughly half the memory per training worker.

## Determinism across engines

Bun (JavaScriptCore) and Deno (V8 15.0, against Node 24's V8 12.4) differ from Node in the last
bit of transcendental math results. For example, a radar contact's `bearing` reads
`104.39354024455824` under Node and `104.39354024455822` under Deno. On these seeds the
differences did not change kills, kill times or run values, but they do change:

- `.events.jsonl` (brain request displays), and with them the `.sgr` frames;
- one of twelve branch `outcome` fingerprints in the corpus. Bun and Deno agreed with each other there.

A simulation that is chaotic enough will amplify a last-bit difference into a different
outcome. Replay and branching therefore hold only on the engine that made the recording.
Recordings made under one engine are not evidence for another, and a Node major upgrade that
moves V8 can break them in the same way. Node with ts-node and Node with the bundle were
byte-identical in every run.

## Compatibility

| Runtime | Runs the stack? | Blockers / notes |
| ------- | --------------- | ---------------- |
| Bun 1.4.3 | Yes, both from TypeScript source and from the bundle | Legacy `@gameField` decorators, `duckdb` (N-API), msgpackr and `child_process.fork` workers all work. The only blocker is non-identical output. |
| Deno 2.9.7 | Only the bundle, renamed `.cjs`, run with `run -A` | Treats `.js` as ESM (`require is not defined`) and cannot run the ts-node entry. `duckdb` and `fork` work. Corpus CPU was 40 % worse than Node. Output is not identical. |

## Profile (Node, bundle, one seed, one process)

`node --cpu-prof dist/cli/train.js … --seeds 1`, 26.9 s of samples:

| Share | Where |
| ----- | ----- |
| 33 % | idle: the main thread waits on DuckDB recording ingest after the run |
| 30 % | `HeadlessGame.tick` (`SpaceManager`/`ShipManager` update, scan jobs, automation) |
| 9 % | `stringToSchemaObject`: scoring decodes every frame back from the `.sgr` |
| 8 % | `HeadlessRecorder.capture`: `saveGame` clones the whole state, then serializes it |
| 5 % | module loading (the bundle removes the ts-node compile, not the load) |
| 2 % | GC |

## Code-level opportunities (estimates, not implemented)

1. **Score from in-memory frames.** `scoreRun` → `scoreFrames` re-decodes every recorded
   frame with `stringToSchemaObject`. Handing the frames over as the recorder captures them saves
   about 9 % of a training worker's samples, or ~13 % of its busy CPU.
2. **Skip or overlap the DuckDB ingest where nothing reads it.** Branching already skips it. A
   training run whose report does not query the store spends up to a third of its wall time
   waiting on it.
3. **Serialize without cloning in `capture`.** `saveGame` clones before serializing, which is
   about 3 % of samples once per sim-second plus the allocation churn behind GC.

The simulation tick itself is about 45 % of busy CPU, spread across many managers, with no
single hot spot above 3 % self time.

## Recommendation

- Stay on Node. No engine wins on speed, and only Node keeps recordings replayable.
- Use `npm run train:js` / `branch:js` (esbuild bundle) for many short worker runs. It is
  byte-identical to the ts-node CLI and removes the ts-node compile from each worker's start.
  The gain is small: a few CPU-seconds per worker.
- For memory-bound corpora (the 12-worker OOM), Bun halves training RSS but breaks replay
  identity. Lower `--workers`, or remove the clone in `capture` (item 3), before switching engines.
- `--max-semi-space-size=64` gave no measurable gain. Leave it off.

## Reproduce

```bash
npm --prefix modules/ai run train:js -- --scenario T3-directed --seeds 4 --crew crews/captain-reference.json --workers 4 --out <dir>
npm --prefix modules/ai run branch:js -- corpus --runs <dir> --crew crews/captain-reference.json --scenario T3-directed --budget 12 --workers 4 --out <corpus>
npx jest --selectProjects=ai --ci modules/ai/src/cli/bundle.spec.ts   # bundle == ts-node, byte for byte
```
