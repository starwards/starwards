---
audience: agent
depth: deep
source_of_truth:
  - modules/ai/build-cli.mjs
  - modules/ai/package.json
  - modules/ai/src/cli/bundle.spec.ts
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

## Precompiled worker CLI

`npm --prefix modules/ai run build:cli` (run by `train:js` / `branch:js` beforehand) is the one build
step every worker reuses. It writes `dist/cli/`:

| File | What it does for each worker |
| ---- | ---------------------------- |
| `<cli>.bundle.js` | esbuild bundle. JSON imports become `JSON.parse` of a string. The regression scorers `v1`–`v3` (6 MB of JSON) stay out of it and load on first read (`scorers` in `modules/ai/src/scoring/score.ts`). |
| `<cli>.js` | Entry: sets `NODE_COMPILE_CACHE` to `dist/cli/.compile-cache`, turns the cache on, then requires the bundle. Workers fork the bundle and inherit the variable. |
| `.compile-cache/` | V8 code cache, written by loading each bundle once at build time. Node ignores an entry whose source changed. |

`Store` (`modules/server/src/test/training/analysis/store.ts`) loads `duckdb` on first use, so
branching workers never load it (≈40 ms and 12 MB per process).

### Options measured

Same workload as above (train seeds 1–4 and corpus budget 12, 4 workers), 2–4 repetitions,
host under load from other agents. Startup is a worker's fork-to-ready time (process start until
its module graph is loaded), the median of 10 forks of an idle worker; an empty `node` takes 41 ms.
RSS per worker is the median of per-worker peaks. Total at 4 is the peak of the summed RSS
sampled every 250 ms. Total at 8 is extrapolated (main + 8 × per-worker share at 4), because the
runs were capped at 4 workers.

| Option | Startup (ms) | Train wall / CPU min (s) | Corpus wall / CPU min (s) | RSS / worker, train / corpus (MB) | Total at 4, train / corpus (MB) | Total at 8, train / corpus (MB, extrapolated) | Identical |
| ------ | ------------ | ------------------------ | ------------------------- | --------------------------------- | ------------------------------- | --------------------------------------------- | --------- |
| ts-node transpile-only | 828 | 11.5 / 54.1 | 25.5 / 126.6 | 568 / 665 | 2254 / 2561 | 4305 / 4796 | baseline |
| bundle with sourcemap (first `build:cli`) | 412 | 10.3 / 45.0 | 23.9 / 114.9 | 541 / 603 | 1996 / 2359 | 3880 / 4509 | yes |
| bundle, no sourcemap | 400 | 10.5 / 45.8 | 23.8 / 115.6 | 540 / 596 | 1988 / 2353 | 3864 / 4499 | yes |
| bundle, minify | 403 | 10.2 / 45.4 | 24.2 / 115.9 | 522 / 556 | 1984 / 2174 | 3860 / 4145 | yes |
| bundle, minify + keepNames | 402 | 10.5 / 45.6 | 24.3 / 118.3 | 522 / 561 | 1927 / 2215 | 3746 / 4224 | yes |
| bundle, JSON as `JSON.parse` | 344 | 10.1 / 45.0 | 24.2 / 117.0 | 524 / 699 | 1925 / 2708 | 3731 / 5205 | yes |
| bundle, packages bundled too (all but `duckdb` and `@starwards/bots`) | – | 10.1 / 44.4 | – | 605 / – | – | – | **no**, decision logs differ |
| `JSON.parse`, scorers `v1`–`v3` left out | 312 | 10.2 / 44.9 | 23.7 / 116.2 | 496 / 698 | 1803 / 2531 | 3512 / 4873 | yes |
| … + compile cache | 269 | 10.0 / 44.3 | 23.8 / 116.3 | 510 / 701 | 1892 / 2466 | 3686 / 4736 | yes |
| … + `worker_threads` instead of `fork` | 256 | 10.4 / 44.6 | did not complete | one process: 1661 | 1657 / – | ≈3200 / – | train yes |
| … + `--max-old-space-size=1024` per worker | 437 in run | 10.3 / 48.0 | 25.0 / 132.1 | 380 / 448 | 1364 / 1645 | 2633 / 3097 | yes |
| **`build:cli` as implemented** | 275 | 10.5 / 46.9 | 25.0 / 122.7 | 478 / 676 | 1800 / 2564 | 3506 / 4933 | yes |

Findings:

- **Startup** is what precompilation buys: 828 → 275 ms per worker. That is ~0.5 s per worker
  start against 10–25 s of work per worker, so wall and CPU barely move. It matters when workers
  are many and short.
- **Minify, keepNames, sourcemaps** change neither startup, CPU nor memory beyond noise. Minified
  output was identical to ts-node: `@gameField` registers schema fields by decorator, not by class
  name. The build keeps names and the sourcemap for readable stack traces.
- **Tree-shaking** is esbuild's default for a bundle. Nothing to turn on.
- **Bundling packages** breaks identity. `@starwards/bots` must stay external, since it reads brain
  files relative to its own directory, and a second copy of `@starwards/core` in the bundle then
  changes the decision logs. Keep every package external.
- **The compile cache is written on a normal exit.** A killed process writes nothing. Loading a
  bundle once fills it as well as a whole training run does.
- **Memory per worker is runtime data, not code.** A loaded worker holds ~90 MB; the rest is the
  game, the recorder and V8 heap growth. The scorer JSON was the one code-side item (−20 MB).
- **A shared code cache does not share memory.** Each process reads it into its own heap.
- **`--max-old-space-size` per worker** cut worker RSS by 25–35 % at every value tried (768, 1024,
  1536), because V8 grows a capped heap less eagerly. Its CPU cost was +8 % (train) and +15 %
  (corpus) in one batch, and within noise of a same-batch control in another. The build does not
  set it. `branch:js` passes `--max-old-space-size=8192`, and workers inherit the parent's flags.
- **`worker_threads`**, tried by swapping `fork` for a thread in a preload, saved ≈60 MB per
  training worker (one Node binary, libuv and native addons; V8 code and heaps stay per isolate)
  with identical output. Module state is per isolate, so each game is isolated per thread;
  `process.env` and the working directory are shared. The corpus CLI did not complete under the
  shim (4 of 12 rows), so threads need their own worker protocol in `train.ts` and `branch.ts`.
  Not implemented.
- **V8 startup snapshot or single-executable app**: not built. A snapshot entry may require only
  built-in modules, so every package would have to be bundled, which breaks identity (above), and
  the native `duckdb` addon cannot be in a snapshot. The ceiling is startup minus an empty `node`:
  ≈230 ms per worker.

### Docker image

Build the bundle in the build stage. Write the cache in the final stage, where Node resolves the
packages at their runtime paths:

```dockerfile
# build stage, after core and bots are built (esbuild is a dev dependency)
COPY modules/server modules/server
COPY modules/ai modules/ai
RUN npm --prefix modules/ai run build:cli

# final stage, after modules/ai/src, crews and brains are copied
COPY --from=build /app/modules/ai/dist/cli modules/ai/dist/cli
RUN cd modules/ai && for cli in train branch; do \
      node -e "process.send = () => true; require('./dist/cli/$cli.js')"; done
# workers: node modules/ai/dist/cli/train.js … and node modules/ai/dist/cli/branch.js …
```

`modules/ai/src/scoring/models` must stay in the image: the bundle reads `v1`–`v3` from there when
a CLI uses them.

## Recommendation

- Stay on Node. No engine wins on speed, and only Node keeps recordings replayable.
- Use `npm run train:js` / `branch:js` for many short worker runs, and `dist/cli` in the image.
  It is byte-identical to the ts-node CLI and starts a worker in a third of the time.
- For memory-bound corpora (the 12-worker OOM), Bun halves training RSS but breaks replay
  identity. Lower `--workers`, or remove the clone in `capture` (item 3), before switching engines.
- `--max-semi-space-size=64` gave no measurable gain. Leave it off.

## Reproduce

```bash
npm --prefix modules/ai run train:js -- --scenario T3-directed --seeds 4 --crew crews/captain-reference.json --workers 4 --out <dir>
npm --prefix modules/ai run branch:js -- corpus --runs <dir> --crew crews/captain-reference.json --scenario T3-directed --budget 12 --workers 4 --out <corpus>
npx jest --selectProjects=ai --ci modules/ai/src/cli/bundle.spec.ts   # train and corpus: bundle == ts-node
```
