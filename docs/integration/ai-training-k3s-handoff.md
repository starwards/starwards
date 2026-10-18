---
audience: both
depth: deep
source_of_truth:
    - docker/training
    - deploy/k3s/training
related:
    - ai-training-k3s.md
    - ai-crew.md
last_verified: 2026-10-18
---

# Overnight training on K3S: operator handoff

This page is for whoever deploys and runs the training jobs on a K3S cluster. It covers what the jobs do,
what they need from the cluster, and how to tell that a night's run worked. For the full reference see
[ai-training-k3s.md](ai-training-k3s.md).

**Background.** Starwards is a multiplayer spaceship game. `modules/ai` holds automated ship crews
("brains") and a headless harness that plays them in the game with no screen or players. The harness
writes recordings (`.sgr` files, one game frame per simulated second) and per-run reports into a
**training archive**: a folder tree organised by day. Three command-line tools matter here:

- `train` plays a training scenario (a **rung**, e.g. `T3-directed`) with one or more crews over a range
  of random seeds. The game is deterministic: the same crew, seed and code give the same run.
- `suite` plays a crew through every curriculum level and checks it against a saved baseline. It fails
  when the crew got worse (a regression).
- `branch corpus` replays recorded runs up to a decision point, plays a different decision from there
  (a **branch**), and compares outcomes. A branch whose replay does not match its recording up to the
  decision point is **diverged** and is excluded from the results.

Crews are either **reference** crews (scripted, free to run) or **Jev** crews, which ask a hosted model
(Jev, from TypeSafe AI) for decisions and cost money per request.

## 1. Image

|                  |                                                                                |
| ---------------- | ------------------------------------------------------------------------------ |
| Dockerfile       | `docker/training/Dockerfile`                                                   |
| Build context    | the repository root                                                            |
| Context filter   | `docker/training/Dockerfile.dockerignore` (BuildKit picks it up automatically) |
| Base             | `node:24.22.0-bookworm-slim`, pinned by digest                                 |
| User             | `node`, uid 1000, gid 1000                                                     |
| Entry point      | `/usr/local/bin/run-job` (`docker/training/run-job.sh`)                        |
| Manifest builder | `/app/build_manifest.py` (`docker/training/build_manifest.py`)                 |

```bash
git checkout k3s-training        # or the branch it was merged into
COMMIT=$(git rev-parse --short HEAD)
docker build -f docker/training/Dockerfile --build-arg GIT_COMMIT=$COMMIT \
  -t <registry>/starwards-training:$COMMIT .
docker push <registry>/starwards-training:$COMMIT
docker run --rm <registry>/starwards-training:$COMMIT help   # prints the job variables
```

Measured: 733 MB on disk, 154 MB compressed content.

**Existing image publishing.** `.github/workflows/deploy.yml` builds and pushes only the game server
image (the root `Dockerfile`) to `ghcr.io/<owner>/<repo>`, tagged with the commit SHA and the preview
release name, on pushes to `master` and on pull requests. No workflow builds or pushes the training image.
The other Dockerfiles (`docker/osc/Dockerfile`, `modules/e2e/Dockerfile`) are not published as training
images either. You must build and push the training image yourself, to a registry the cluster can pull from.

**Why the Node version is pinned.** Floating-point Math results can differ in the last bit between
JavaScript engines and engine versions. A recording therefore replays, and its branches compare, only on
the same Node version that made it. The image uses the same Node as the development host (24.22.0). Each
run folder gets a `runtime.json` stamp (`{"node": "...", "commit": "..."}`), and the merge step refuses to
combine shards with different stamps.

## 2. Environment variables

The pod's entry point reads these (`docker/training/run-job.sh`):

| Name                   | Meaning                                                                                      | Default                                                         | Allowed values                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JOB`                  | what to run; the container's first argument overrides it                                     | `help`                                                          | `train`, `branch`, `suite`, `merge`, `help`                                                                                                                                                                      |
| `SCENARIO`             | training rung                                                                                | none (required for `train`, `branch`, `merge`)                  | rung names in `modules/server/src/test/training/training-scenarios.ts`, e.g. `T0`, `T1`, `T1-lite`, `T2`, `T2-dock`, `T3-directed`                                                                               |
| `CREWS`                | comma-separated crew files relative to `modules/ai`; `branch` and `suite` use only the first | none (required)                                                 | files in `modules/ai/crews/`, e.g. `crews/captain-reference.json`                                                                                                                                                |
| `FIRST_SEED`           | first seed of shard 0                                                                        | `1`                                                             | positive integer                                                                                                                                                                                                 |
| `SEEDS_PER_SHARD`      | seeds each shard plays; shard _i_ plays from `FIRST_SEED + i × SEEDS_PER_SHARD`              | `2`                                                             | positive integer                                                                                                                                                                                                 |
| `SHARDS`               | number of shards; must equal the Job's `completions`                                         | `1`                                                             | positive integer                                                                                                                                                                                                 |
| `JOB_COMPLETION_INDEX` | this pod's shard number; Kubernetes sets it on Indexed Jobs                                  | `0`                                                             | `0` … `SHARDS-1`                                                                                                                                                                                                 |
| `WORKERS`              | worker processes inside the pod                                                              | `1`                                                             | positive integer                                                                                                                                                                                                 |
| `TIMEOUT`              | simulated seconds before a run is cut off                                                    | `300` (`train`), `400` (`branch`)                               | positive integer                                                                                                                                                                                                 |
| `BUDGET`               | branches this shard plays                                                                    | `25`                                                            | positive integer                                                                                                                                                                                                 |
| `LEVELS`               | `branch`: decision levels; `suite`: curriculum levels                                        | `strategic,tactical`; suite: every built level                  | `branch`: `strategic`, `tactical` (`button` also needs `--station` and `--control` in `EXTRA_ARGS`); `suite`: level ids in `modules/ai/curriculum/` (`L0`, `L0b`, `L1` … `L8`); levels not yet built are skipped |
| `BASELINE`             | suite baseline to compare against                                                            | the crew's name                                                 | `reference`, `idle`, `recommended` (files in `modules/ai/curriculum/baselines/`)                                                                                                                                 |
| `HEAP_MB`              | V8 heap cap per Node process, MB                                                             | `4096`                                                          | integer                                                                                                                                                                                                          |
| `EXTRA_ARGS`           | extra flags appended to the CLI call                                                         | empty                                                           | CLI flags from [ai-crew.md](ai-crew.md#training)                                                                                                                                                                 |
| `RUN_NAME`             | run folder name                                                                              | `JOB_NAME`, else `<JOB>-<SCENARIO>`                             | a folder name                                                                                                                                                                                                    |
| `RUN_DATE`             | archive day                                                                                  | parsed from a CronJob's job name, else today (UTC) at pod start | `YYYY-MM-DD`                                                                                                                                                                                                     |
| `JOB_NAME`             | the Kubernetes Job name; the manifests set it from the pod label `job-name`                  | empty                                                           |                                                                                                                                                                                                                  |
| `KIND`                 | `merge` only: what was sharded                                                               | `branch` if shard 0 has a corpus, else `train`                  | `train`, `branch`                                                                                                                                                                                                |
| `KEEP_SHARDS`          | `1` keeps the per-shard folders after a successful merge                                     | `0`                                                             | `0`, `1`                                                                                                                                                                                                         |
| `ARCHIVE`              | archive root inside the container                                                            | `/training-archive`                                             | path                                                                                                                                                                                                             |
| `GIT_COMMIT`           | code commit, recorded in stamps and the manifest; set at build time                          | `unknown`                                                       |                                                                                                                                                                                                                  |

Read by the tools the entry point calls:

| Name                         | Meaning                                             | Default                                 |
| ---------------------------- | --------------------------------------------------- | --------------------------------------- |
| `TYPESAFE_API_KEY`           | Jev API key; required only by Jev crews (section 7) | unset                                   |
| `TYPESAFE_BASE_URL`          | Jev API endpoint                                    | `https://api.typesafe.ai`               |
| `JEV_CACHE`                  | `off` disables the on-disk Jev answer cache         | on                                      |
| `JEV_CACHE_DIR`              | answer cache folder                                 | `/training-archive/jev-cache`           |
| `STARWARDS_RECORDING_DELTAS` | `0` writes recordings without delta frames          | on                                      |
| `NODE_ENV`, `NODE_PATH`      | set by the image; do not change                     | `production`, `/opt/tools/node_modules` |

## 3. Memory and CPU

Peak resident memory per process, measured on 2026-10-18 with `branch` jobs of `captain-reference`
(4 workers, 4 seeds, 16 branches):

| Where                     | Rung        | `train` worker | `branch` worker | parent process | pod total |
| ------------------------- | ----------- | -------------- | --------------- | -------------- | --------- |
| image                     | T3-directed | 0.55–0.64 GiB  | 0.71–1.13 GiB   | 0.36 GiB       | 3.5 GiB   |
| image                     | T2-dock     | 0.65–0.96 GiB  | 1.06–1.41 GiB   | 0.48 GiB       | 4.7 GiB   |
| host (Windows, same code) | mixed       | ≈ 0.61 GiB     | ≈ 0.80 GiB      |                |           |

**Sizing formula:** memory = `WORKERS × 1.5 GiB + 0.5 GiB` per pod. The manifests use 4 workers with a
request of 6656 Mi and a limit of 7 Gi. At this rate 12 workers need about 18.5 GiB, which is why 12
workers on a 16 GB machine ran out of memory.

**CPU:** measured with the image, T3-directed, 4 workers:

| Job                             | wall | CPU time | cores busy | per worker |
| ------------------------------- | ---- | -------- | ---------- | ---------- |
| `train`, 4 seeds                | 35 s | 121 s    | 3.5        | ≈ 0.9 core |
| `branch`, 4 seeds + 16 branches | 74 s | 303 s    | 4.1        | ≈ 1 core   |

Workers are CPU-bound: one worker keeps one core busy. Request 1 CPU per worker. Do not set a CPU limit
below `WORKERS`, or the runs only take longer.

**Smallest useful nightly configuration:** 1 shard × 4 workers on a node with 4 free cores and 7 GiB
free memory. The nightly branch corpus needs every seed's recording, and the reference captain's
baseline covers 16 seeds, so with 1 shard set `SEEDS_PER_SHARD=16`, `SHARDS=1`, `completions=1`,
`parallelism=1` and `BUDGET=400`. It takes about four times as long as the 4-shard default (section 5).
Fewer than 4 workers fits on smaller nodes but takes proportionally longer. The suite needs 4 workers'
worth of memory as configured.

## 4. Shards, merge and storage

**How the last shard is found.** Every shard writes `/training-archive/_shards/<day>/<run>/shard-<i>/`,
then a `done` file in it. After writing `done`, a shard counts the `done` files. If the count has reached
`SHARDS`, it tries to create the directory `_shards/<day>/<run>/.merging`. Directory creation is atomic,
so only one shard succeeds, and that shard merges:

1. checks that every shard's `runtime.json` is identical (same Node, same commit), and fails otherwise;
2. copies recordings into the day folder and rebuilds one report over every seed (`train`), or the
   recorded runs plus one branch corpus (`branch`);
3. rebuilds `<day>/manifest.jsonl` with `/app/build_manifest.py`;
4. deletes `_shards/<day>/<run>/` unless the merge failed or `KEEP_SHARDS=1`.

**Shared storage.** Every shard of a Job must see the same archive volume, because the last shard reads
the others' output.

- ReadWriteMany storage (NFS, Longhorn RWX, CephFS) lets shards run on any node.
- A single node directory works: either the K3S default `local-path` class with `ReadWriteOnce`, or the
  `hostpath/` component. Every training pod must then be pinned to that node with the node selector, and
  the node needs `parallelism × WORKERS` free cores and the memory for them.
- Do not use ReadWriteOnce storage with pods on several nodes: the shards would not all mount the volume.

**Archive size per night.** Measured: one T3-directed run is about 7 MB (its recording and event log).
A T2-dock run is 0.6–3.5 MB of recording plus its events. A branch corpus is under 1 MB per 400 branches.
A host suite run of the reference crew wrote 2.2 GB, of which 1.4 GB were DuckDB query caches that the
image now deletes (they rebuild on demand), leaving about 0.8 GB. Extrapolated for the two CronJobs:

| CronJob                                 | per night                                                    |
| --------------------------------------- | ------------------------------------------------------------ |
| `nightly-branch` (16 T3-directed seeds) | ≈ 115 MB, plus ≈ 300 MB transient in `_shards` while it runs |
| `nightly-suite`                         | ≈ 0.8 GB                                                     |
| total                                   | ≈ 0.9 GB per night, ≈ 28 GB per month                        |

**Retention.** None exists: nothing deletes old days, and `ttlSecondsAfterFinished` removes only
finished Job objects (after 7 days), not their files. A retention policy needs: the number of days to
keep, or a size cap; a way to keep days someone has marked (for example, never delete a day folder that
holds a `README.md`); and a CronJob that copies days off the volume before deleting them, if they should
be kept elsewhere. The `jev-cache/` folder must never be deleted by it: it is what makes repeat Jev runs
free.

## 5. Jobs and CronJobs

Paths are under `deploy/k3s/training/`. Durations are **measured** from runs on 2026-10-18 or
**derived** from those measurements.

| Resource                                                   | Runs                                                                                      | Duration                                                               | Re-run safe                                                                                   | Two copies at once                                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `cronjob-suite.yaml`, CronJob `nightly-suite`, 00:00 UTC   | `suite` of `crews/reference.json`, every built level, 4 workers                           | ≈ 11 min (measured on the host, 4 workers)                             | yes: each run gets its own `<crew>-<HHMMSS>` folder                                           | prevented by `concurrencyPolicy: Forbid`                                          |
| `rolling-branch.yaml`, `rolling-sweep.yaml`, CronJobs every 10 min | filler lanes: fresh seeds every cycle, rungs in turn (ai-training-k3s.md, Continuous training) | ≈ 15–45 min per cycle, one pod each | yes: each cycle claims a cycle index on the archive | prevented by `concurrencyPolicy: Forbid` |
| `jobs/branch/`, Job `branch-t3-directed`                   | the same corpus, once                                                                     | as above                                                               | delete the Job first; delete `_shards/<day>/branch-t3-directed/` if a previous attempt failed | no: Kubernetes refuses a second Job with the same name                            |
| `jobs/train-jev/`, Job `train-t1-jev`                      | `train`, T1, `reference` vs `jev-helms-weapons`, 4 shards × 8 seeds; needs the Jev Secret | not measured; Jev latency dominates. A cache-warm re-run costs nothing | as above; answers already cached are free                                                     | no                                                                                |
| `jobs/collect/`, Job `collect`                             | `merge` of an existing sharded run (set `RUN_NAME`, `RUN_DATE`, `SCENARIO`, `KIND`)       | seconds to a minute (derived)                                          | yes                                                                                           | not while the run it merges is still running: the two would write the same folder |

The derived branch duration: in the image, 16 T3-directed branches took 37 s on 4 workers (≈ 9 s per
branch per worker). On the host, an earlier 400-branch T3-directed corpus took 23 min on 12 workers
(≈ 41 s per branch per worker). Branch length varies with the decision point; with 100 branches on 4
workers, the range is 4–17 minutes plus about 1 minute to record the seeds.

**Same-day collisions.** Every job rebuilds `<day>/manifest.jsonl` by rewriting the whole file. Two jobs
finishing at the same moment on the same day could leave the manifest incomplete. The default schedules
are an hour apart, which avoids this. Re-running any job, or running `jobs/collect`, rebuilds the manifest
correctly.

## 6. The manifest step

`<day>/manifest.jsonl` has one line per recording: header, the brains that played, event counts,
outcome, code commit (`codeCommit`) and Node version (`node`, from the nearest `runtime.json`;
`unknown` for runs made before stamps existed). The training datasets and analysis tools read archive
days through it, so a day without an up-to-date manifest is invisible to them.

The builder is baked into the image and runs after every merge and suite: no copy step is needed. The
canonical copy is `docker/training/build_manifest.py` in the repository; the copy in the developer's
local training archive is a duplicate of it. To rebuild a day's manifest by hand on the archive volume:

```bash
kubectl -n <namespace> run manifest --rm -i --restart=Never \
  --image=<registry>/starwards-training:<commit> \
  --overrides='{"spec":{"securityContext":{"runAsUser":1000,"fsGroup":1000},"volumes":[{"name":"a","persistentVolumeClaim":{"claimName":"training-archive"}}],"containers":[{"name":"manifest","image":"<registry>/starwards-training:<commit>","command":["python3","/app/build_manifest.py","<YYYY-MM-DD>","<commit>"],"volumeMounts":[{"name":"a","mountPath":"/training-archive"}]}]}}'
```

The second argument is the commit recorded for runs that `commits.json` (if present in the day folder)
and the previous manifest do not already cover.

## 7. Jev secret

|             |                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Secret name | `jev` (in the training namespace)                                                                                   |
| Key         | `TYPESAFE_API_KEY`                                                                                                  |
| Used by     | `jobs/train-jev/` only. The CronJobs and `jobs/branch/` use reference crews and do not read it                      |
| Value       | the TypeSafe API key. It is held by the project owner (on their workstation, in `helios/.env.jev`); ask them for it |

```bash
kubectl -n <namespace> create secret generic jev --from-literal=TYPESAFE_API_KEY=<value from the owner>
```

The key is never in the image or the repository. Jev costs money per request: run a 1-shard, 2-seed Jev
Job first and read the token counts in its report before launching a full night. The account allows 1000
requests per minute; `train` divides that between the workers of one pod only, so keep Jev Jobs at
`parallelism` 1–2.

## 8. Checking a run

In the archive volume, for day `<day>`:

| Run      | Look at                                                    | Correct result                                                                                        |
| -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| any      | pod logs                                                   | the last shard prints `all N shard(s) done: merging`, then `runs: …` and `… entries, … with outcomes` |
| any      | `_shards/<day>/`                                           | empty or absent after success; leftovers mean a shard or the merge failed                             |
| `branch` | `<day>/branching/<run>-runs/T3-directed-crews.md`          | the reference captain (`captain-reference`) kills its target on every seed: 16/16 for seeds 1–16      |
| `branch` | `<day>/branching/<run>-corpus/corpus.md` header, `mine.md` | `(0 diverged)`; the merge fails the Job otherwise                                                     |
| `suite`  | `<day>/suite/reference-<time>/suite.md`                    | no level marked `regressed`; the Job fails otherwise                                                  |
| any      | `runtime.json` in each run folder                          | identical `node` and `commit` across all of a night's folders, matching the image tag                 |
| any      | `<day>/manifest.jsonl`                                     | one line per `.sgr`; each has `node` (e.g. `v24.22.0`) and `codeCommit`                               |

Reproducibility check: the image's output for T3-directed seeds 1–2 and a 4-branch corpus was identical
to a run of the same commit outside the container (kills, times, run values, every branch row, decoded
recording frames).

## 9. FILL markers

Every value the cluster operator must set is marked `FILL` (`grep -rn FILL deploy/k3s/training`):

| File:line                                                                                                      | Set                                                        | Neutral default and trade-off                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kustomization.yaml:1`                                                                                         | (header: instructions)                                     |                                                                                                                                                                              |
| `kustomization.yaml:7` and `namespace.yaml:4`                                                                  | namespace                                                  | `starwards-training`. Keep it unless it collides with an existing namespace                                                                                                  |
| `jobs/branch/kustomization.yaml:3`, `jobs/collect/kustomization.yaml:3`, `jobs/train-jev/kustomization.yaml:3` | the same namespace                                         | must match `kustomization.yaml`                                                                                                                                              |
| `params/kustomization.yaml:6`                                                                                  | image name, `newName`                                      | the registry path you pushed to. A registry inside the cluster avoids pull secrets; an external one needs `imagePullSecrets` on the pod templates                            |
| `params/kustomization.yaml:8`                                                                                  | image tag, `newTag`                                        | the short commit you built. Change it only together with a new build: shards of one night must use one tag                                                                   |
| `params/kustomization.yaml:11`                                                                                 | node selector patches                                      | keep both patches; edit their label                                                                                                                                          |
| `params/node-selector.yaml:1`, `params/node-selector-cron.yaml:1`                                              | node label, default `starwards/training: "true"`           | Label the node(s) with it. One node: works with any storage and gives predictable memory. Several nodes: needs ReadWriteMany storage                                         |
| `archive-pvc.yaml:8`                                                                                           | `storageClassName`, `accessModes`                          | with RWX storage, its class and `ReadWriteMany`. With K3S `local-path`, `local-path` and `ReadWriteOnce`, and one node in the selector                                       |
| `archive-pvc.yaml:15`                                                                                          | size, default `50Gi`                                       | ≈ 1 GB per night with both CronJobs (section 4): 50 Gi lasts about seven weeks without retention                                                                             |
| `hostpath/volume.yaml:1`, `hostpath/volume-cron.yaml:1`                                                        | node directory, default `/srv/training-archive`            | Only if you use the `hostpath` component instead of the claim. The directory must exist and be owned by uid 1000                                                             |
| `cronjob-suite.yaml:9`                                                                | `schedule`, `timeZone`, defaults 00:00 and 01:00 `Etc/UTC` | any quiet hours. Keep them at least 30 minutes apart (manifest rewrite, section 5), and keep both on the same side of midnight in `timeZone` so they land on one archive day |

Not marked, but sized for a node with at least 4 free cores and 7 GiB per running shard: `completions`,
`parallelism`, `SHARDS`, `WORKERS` and `resources` in each Job and CronJob (section 3).

## 10. Known gaps

- A precompiled worker CLI exists only on the `engine-runtime` branch (commit 3eabdb5b), which is not
  pushed to GitHub, and is not in the image. `npm --prefix modules/ai run build:cli` writes
  `modules/ai/dist/cli`: an esbuild bundle, a small entry that enables the V8 compile cache, and a
  prebuilt compile cache. Worker start-up drops from 828 ms (TypeScript compiled on the fly, as in the
  image) to 275 ms. Output is identical, which a test (`bundle.spec.ts`) pins. Wall time, CPU and memory
  are unchanged beyond noise. The suggested Dockerfile change is in
  `docs/testing/headless-runtime-benchmarks.md` ("Precompiled worker CLI") on that branch. It has not
  been tested in an image.
- Pod density option, not applied: capping each worker's heap at 768–1536 MB (`--max-old-space-size`;
  here `HEAP_MB`, which today also caps the parent) cut worker memory by 25–35% in benchmarks, but its
  CPU cost is unclear, measured anywhere from +0% to +15%. Re-measure before lowering the memory sizing
  in section 3.
- The image tag is a commit, so a tag says which code ran but the manifests must be edited (`newTag`) for
  each new build. There is no `latest` tag, on purpose: shards on different builds would not merge.
- The `missile-range` spec fails on 8 seeds on the base branch (`captain-branching`). It is a test of the
  game, not of these jobs.
- A failed run leaves `_shards/<day>/<run>/` behind, including `.merging` if the merge itself failed.
  Before re-running the same Job name on the same day, delete that folder, or run `jobs/collect` after
  re-running the failed shard.
- If a shard fails more than once (`backoffLimitPerIndex: 1`), the Job fails without merging.
- `RUN_DATE` for a one-off Job is the day each pod starts (UTC). A one-off Job whose pods start on both
  sides of midnight splits into two days: set `RUN_DATE` explicitly for those.
- No retention, no alerting: a failed CronJob is visible only as a failed Job and its pod logs.
- The suite's regression verdict compares against the baseline committed in
  `modules/ai/curriculum/baselines/`; a new baseline needs a new image.
