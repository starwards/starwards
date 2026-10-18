---
audience: both
depth: deep
source_of_truth:
    - docker/training
    - deploy/k3s/training
    - modules/ai/src/cli/merge-shards.ts
    - docker/training/rolling.sh
    - docker/training/mining.py
    - docker/training/dispatch.mjs
related:
    - ai-crew.md
    - docker.md
last_verified: 2026-10-18
---

# Overnight training on K3S

The `modules/ai` CLIs (`train`, `suite`, `branch corpus`) packed in one image and run as Kubernetes Jobs:
an Indexed Job shards seeds across pods, every shard writes to a shared archive volume, and the shard that
finishes last merges them into one run folder laid out as `helios/training-archive` (see its README), then
rebuilds that day's `manifest.jsonl`. Commands for the CLIs themselves: [ai-crew.md](ai-crew.md#training).

## Image

[`docker/training/Dockerfile`](../../docker/training/Dockerfile), context the repo root; its context filter
is `docker/training/Dockerfile.dockerignore`. Node 24.22.0 on bookworm-slim, pinned by digest, the same Node as the host: last-bit Math results differ between engines, so a recording replays and its branches fingerprint only on the engine that made it;
`core` and `bots` built to `cjs`; `train` and `branch` run precompiled (`dist/cli`, `build:cli`, with its V8
compile cache written in the image; output identical to ts-node), the other CLIs from source through ts-node
(transpile-only), as on a host. Runs as `node` (uid 1000). No key or `.env` is copied in.

```bash
COMMIT=$(git rev-parse --short HEAD)
docker build -f docker/training/Dockerfile --build-arg GIT_COMMIT=$COMMIT -t <registry>/starwards-training:$COMMIT .
docker push <registry>/starwards-training:$COMMIT
```

Tag by commit: a branch replays a recording only on the code that recorded it, and the manifest records
`GIT_COMMIT` as the runs' code commit.

### Job spec

The entry point [`run-job.sh`](../../docker/training/run-job.sh) reads the job from the environment
(`docker run ... <image> help` prints the list):

| Variable                                       | Meaning                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `JOB`                                          | `train`, `branch` (train this shard's seeds, then `branch corpus` over them), `suite`, `merge`                              |
| `SCENARIO`, `CREWS`                            | rung; comma-separated crew files relative to `modules/ai` (`branch` and `suite` take the first)                             |
| `FIRST_SEED`, `SEEDS_PER_SHARD`, `SHARDS`      | shard _i_ (`JOB_COMPLETION_INDEX`) plays seeds `FIRST_SEED + i·SEEDS_PER_SHARD` onwards; `SHARDS` = the Job's `completions` |
| `WORKERS`                                      | worker processes in the pod (`--workers`)                                                                                   |
| `BUDGET`, `LEVELS`                             | branches per shard; decision levels (`suite`: curriculum levels)                                                            |
| `TIMEOUT`, `BASELINE`, `HEAP_MB`, `EXTRA_ARGS` | run timeout; suite baseline; V8 heap cap per process (4096); extra CLI flags                                                |
| `RUN_NAME`, `RUN_DATE`                         | run folder and archive day; default the Job's name and, for a CronJob, its scheduled day                                    |
| `KEEP_SHARDS`                                  | `1` keeps `_shards/<day>/<run>/` after the merge                                                                            |

Local run, archive in `./archive`:

```bash
docker run --rm -v "$PWD/archive:/training-archive" -e JOB=branch -e SCENARIO=T3-directed \
  -e CREWS=crews/captain-reference.json -e SEEDS_PER_SHARD=2 -e WORKERS=2 -e BUDGET=4 -e RUN_NAME=try \
  <registry>/starwards-training:$COMMIT
```

### Output layout

| Job                  | Lands in (under the archive root)                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| shard _i_ of any job | `_shards/<day>/<run>/shard-<i>/runs` (and `/corpus`), `done` marker                                                            |
| `train`              | `<day>/headless/<run>/`: `<crew>/<scenario>_seed<N>.sgr` + `.events.jsonl`, `<scenario>-crews.md/json` over every seed         |
| `branch`             | `<day>/branching/<run>-runs/` as above, `<day>/branching/<run>-corpus/`: `branches.jsonl`, `corpus.md`, `mine.md`              |
| `suite`              | `<day>/suite/<crew>-<HHMMSS>/` (`suite.md/json`, per-level runs)                                                               |
| every run folder     | `runtime.json`: Node version and code commit; a merge refuses shards whose stamps differ                                       |
| every job            | `<day>/manifest.jsonl` rebuilt by the image's `build_manifest.py`; every entry carries `node` from the `runtime.json` above it |
| Jev answers          | `jev-cache/` (the CLIs' default cache path resolves there)                                                                     |

`build_manifest.py` is canonical in the repo
([`docker/training/build_manifest.py`](../../docker/training/build_manifest.py), baked into the image at
`/app/build_manifest.py`); `helios/training-archive/build_manifest.py` is a copy of it for host runs.

A merge fails, and keeps the shards, when a shard's report is missing or a branch diverged from its
recording.

## Memory: size from workers

Measured in the image (per-process VmRSS sampled each second, `branch` jobs of `captain-reference`, 4 workers):

| Job (4 workers, 4 seeds, 16 branches) | `train` worker | `branch` worker | parent (`corpus` planner) | pod peak, all processes |
| ------------------------------------- | -------------- | --------------- | ------------------------- | ----------------------- |
| T3-directed                           | 0.55–0.64 GiB  | 0.71–1.13 GiB   | 0.36 GiB                  | 3.5 GiB                 |
| T2-dock                               | 0.65–0.96 GiB  | 1.06–1.41 GiB   | 0.48 GiB                  | 4.7 GiB                 |

On the host under ts-node the same jobs peak lower (train ≈ 610 MB, branch ≈ 800 MB per worker); the image
numbers above are the ones to size pods by. Plan **1.5 GiB per worker plus 0.5 GiB** per pod: 4 workers request 6.5 GiB (limit 7 GiB).

Requests and limits in the manifests are `WORKERS × per-worker + parent`. Twelve workers of a
16-core host ran out of memory on the T2-dock corpus: size `WORKERS` by memory, not cores.

## Cluster setup

Manifests: [`deploy/k3s/training/`](../../deploy/k3s/training) (kustomize).

| File                                 | What                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `kustomization.yaml`                 | namespace, archive volume, the two CronJobs                                        |
| `params/`                            | component holding the cluster parameters (image, node selector), used by every job |
| `namespace.yaml`, `archive-pvc.yaml` | namespace, archive claim                                                           |
| `cronjob-suite.yaml`                 | nightly regression suite of `crews/reference.json`, every built level              |
| `rolling-branch.yaml`, `rolling-sweep.yaml` | the two filler lanes of continuous training (below)                         |
| `dispatcher/`                        | optional component: fills the third slot when idle (needs `dispatcher/rbac.yaml`) |
| `jobs/branch/`                       | the same corpus as a one-off Indexed Job                                           |
| `jobs/train-jev/`                    | `reference` vs `jev-helms-weapons` on T1, 4 shards × 8 seeds, with the Jev key     |
| `jobs/collect/`                      | re-runs a merge (after re-running a failed shard by hand)                          |
| `hostpath/`                          | optional component: the archive on a node directory instead of the claim           |

### Fill in

Every value marked `FILL`:

| Parameter                        | Where                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Registry and tag                 | `params/kustomization.yaml` `images`                                                                                       |
| Namespace                        | `kustomization.yaml`, `jobs/*/kustomization.yaml` `namespace`, `namespace.yaml`                                            |
| Storage class, access mode, size | `archive-pvc.yaml` (local-path is ReadWriteOnce: switch the mode and pin to one node)                                      |
| Node selector                    | `params/node-selector.yaml`, `params/node-selector-cron.yaml`, and label the node(s)                                       |
| Or a hostPath                    | `hostpath/volume*.yaml`, then list `hostpath` under `components`                                                           |
| Schedules, time zone             | `cronjob-*.yaml`                                                                                                           |
| Shards, workers, memory          | `completions`/`parallelism`/`SHARDS`, `WORKERS`, `resources` per job, from the table above and the node's cores and memory |
| Registry pull secret             | if the registry needs one: `imagePullSecrets` on the pod templates                                                         |

### Launch

```bash
kubectl apply -k deploy/k3s/training                          # namespace, claim, CronJobs
kubectl -n starwards-training create secret generic jev \
  --from-literal=TYPESAFE_API_KEY=<key>                        # only for Jev crews
kubectl create -k deploy/k3s/training/jobs/branch             # one-off run tonight
kubectl -n starwards-training get pods -l starwards/job=branch -w
```

The Job name is the run name; delete the Job (or rename it) before launching it again.

### Collect

```bash
kubectl -n starwards-training logs job/branch-t3-directed --all-containers --prefix | tail
kubectl -n starwards-training run fetch --rm -i --image=busybox:1.37 --overrides='{"spec":{"volumes":[{"name":"a","persistentVolumeClaim":{"claimName":"training-archive"}}],"containers":[{"name":"fetch","image":"busybox:1.37","stdin":true,"command":["tar","cf","-","-C","/a","<day>"],"volumeMounts":[{"name":"a","mountPath":"/a"}]}]}}' \
  | tar xf - -C ../training-archive
```

A failed shard (after `backoffLimitPerIndex` retries) fails the Job and no merge happens; the other shards stay
in `_shards/<day>/<run>/`. Re-run that seed range by hand into the same shard folder, then run `jobs/collect`
with the run's name, day, scenario and kind.

## Continuous training

Filler work keeps the slots busy around the clock on reference crews ($0). Every filler Job is one cycle of
[`rolling.sh`](../../docker/training/rolling.sh) (`JOB=rolling`), labelled `role=filler` and
`starwards/lane=<lane>`, one pod, 4 workers, hard stop at 90 min:

| Lane     | CronJob          | Rungs, in turn                                             | Per cycle                                                    | Wall      |
| -------- | ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| `branch` | `rolling-branch` | T3-directed, T3-incoming, T2-dock, W-waves; level set `strategic,tactical`, then `button` (helms `afterBurner`) after each full turn | `captain-reference` records 48 seeds (W-waves 12), then up to 1200 branches | ~45 min |
| `sweep`  | `rolling-sweep`  | T1, T2, T2-constrained, T3-directed, T3-incoming, T2-dock, W-waves | `reference` and `captain-reference` on 120 held-out seeds (W-waves 24), paired by seed | 15–45 min |

Both CronJobs fire every 10 minutes with `concurrencyPolicy: Forbid`: a new cycle starts within 10 minutes
of the last one ending. Together they hold 2 of the 3 slots; the third is for ad-hoc and nightly Jobs.

- **Seeds** never repeat: a cycle claims index _c_ in `mining/_lanes/<lane>/cycles.jsonl` (under a lock),
  and plays seeds `base + 1000c` onwards (`branch` 1 000 000, `sweep` 5 000 000), far from the curriculum's
  1–16. A failed cycle's seeds stay claimed.
- **Mining** accumulates outside the day folders, so the 30-day retention keeps it:

    | Path under `/training-archive/mining/<rung>/` | What                                                                                     |
    | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
    | `branches-<commit>.jsonl`                     | every branch row of that code, all cycles                                                |
    | `sweep-<commit>.jsonl`                        | every sweep run row (crew, seed, killed, kills, seconds, score)                          |
    | `LATEST.md`                                   | current commit: top alternatives by paired Δ run value, 95% t interval, sign test, seeds that gained or lost a kill; sweep crews against the reference |
    | `history.md`                                  | one line per cycle                                                                        |

  [`mining.py`](../../docker/training/mining.py) rebuilds `LATEST.md` after every cycle. A `BEATS` row is
  evidence for a reference rule, to replay with `branch fork` before writing one. The full per-state report:
  `npm run branch -- mine --corpus <archive>/mining/<rung>/branches-<commit>.jsonl`.
- Day folders keep the runs: `<day>/branching/rolling-branch-c<c>-<rung>-runs|-corpus`,
  `<day>/headless/rolling-sweep-c<c>-<rung>/`, and the day's `manifest.jsonl`.

### Ad-hoc Jobs and the dispatcher

Label ad-hoc Jobs `role=adhoc` (and the usual `app.kubernetes.io/name: starwards-training`, which gives one
pod per node). With the lanes alone, an ad-hoc Job takes the free third slot at once.

The dispatcher ([`dispatch.mjs`](../../docker/training/dispatch.mjs), every 5 min) fills the third slot too:

- Any unfinished Job without `role=filler` (ad-hoc, nightly, pending on quota) is demand: no new filler, so
  a slot frees when the next filler cycle ends.
- A CronJob that fires within 60 min (a filler cycle's wall) caps fillers at 2.
- Otherwise fillers fill 3 slots; each running lane CronJob reserves one, the dispatcher creates the rest
  from the lanes' `jobTemplate`, the lane picked by `LANE_WEIGHTS` (`branch=2,sweep=1`).

In the cluster it runs as CronJob `filler-dispatcher` under its own account: enable `- dispatcher` in
`kustomization.yaml` once the cluster repo has applied [`dispatcher/rbac.yaml`](../../deploy/k3s/training/dispatcher/rbac.yaml)
(the training-manager account cannot create RBAC). Outside the cluster: `kubectl proxy --port=8001`, then
`KUBE_API=http://127.0.0.1:8001 node docker/training/dispatch.mjs` (`DRY_RUN=1` prints the decision only).

## Cost and the Jev cap

- Reference crews (`reference`, `captain-reference`, `idle`, every `*-reference`) call no model: suite and
  branch CronJobs cost nothing.
- A Jev crew asks one question per seat per decision. The account budget is 1000 requests/minute, which
  `train` divides between its workers within a pod only: across shards it is not shared. Keep
  `SHARDS × WORKERS` low enough that the sum stays under the budget, and launch Jev jobs with
  `parallelism` 1–2.
- The answer cache on the volume (`jev-cache/`) makes a repeat of the same crew, seeds and code free.
  Copy the host cache onto the volume to start warm.
- Spend cap: Jev work is budgeted ($20 total for the curriculum). Run a 1-shard, 2-seed Jev Job first and
  read the token counts in its `<scenario>-crews.md` before launching a full night.
