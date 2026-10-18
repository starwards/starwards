---
audience: both
depth: deep
source_of_truth:
    - docker/training
    - deploy/k3s/training
    - modules/ai/src/cli/merge-shards.ts
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
is `docker/training/Dockerfile.dockerignore`. Node 24.18.0 (`.nvmrc`) on bookworm-slim, pinned by digest;
`core` and `bots` built to `cjs`, `server` and `ai` run from source through ts-node (transpile-only), as
on a host. Runs as `node` (uid 1000). No key or `.env` is copied in.

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

| Job                  | Lands in (under the archive root)                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| shard _i_ of any job | `_shards/<day>/<run>/shard-<i>/runs` (and `/corpus`), `done` marker                                                    |
| `train`              | `<day>/headless/<run>/`: `<crew>/<scenario>_seed<N>.sgr` + `.events.jsonl`, `<scenario>-crews.md/json` over every seed |
| `branch`             | `<day>/branching/<run>-runs/` as above, `<day>/branching/<run>-corpus/`: `branches.jsonl`, `corpus.md`, `mine.md`      |
| `suite`              | `<day>/suite/<crew>-<HHMMSS>/` (`suite.md/json`, per-level runs)                                                       |
| every job            | `<day>/manifest.jsonl` rebuilt by the archive's `build_manifest.py`, when it is on the volume                          |
| Jev answers          | `jev-cache/` (the CLIs' default cache path resolves there)                                                             |

A merge fails, and keeps the shards, when a shard's report is missing or a branch diverged from its
recording.

## Memory: size from workers

Measured in the image (per-process VmRSS sampled each second, `branch` jobs of `captain-reference`, 4 workers):

| Job (4 workers, 4 seeds, 16 branches) | `train` worker | `branch` worker | parent (`corpus` planner) | pod peak, all processes |
| ------------------------------------- | -------------- | --------------- | ------------------------- | ----------------------- |
| T3-directed                           | 0.55–0.64 GiB  | 0.71–1.13 GiB   | 0.36 GiB                  | 3.5 GiB                 |
| T2-dock                               | 0.65–0.96 GiB  | 1.06–1.41 GiB   | 0.48 GiB                  | 4.7 GiB                 |

Plan **1.5 GiB per worker plus 0.5 GiB** per pod: 4 workers request 6.5 GiB (limit 7 GiB).

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
| `cronjob-branch.yaml`                | nightly T3-directed branch corpus, 4 shards × 4 seeds, 400 branches                |
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

The Job name is the run name; delete the Job (or rename it) before launching it again. Copy the archive's
`build_manifest.py` onto the volume once, or manifests are not rebuilt:
`kubectl cp ../training-archive/build_manifest.py <namespace>/<a running pod>:/training-archive/`.

### Collect

```bash
kubectl -n starwards-training logs job/branch-t3-directed --all-containers --prefix | tail
kubectl -n starwards-training run fetch --rm -i --image=busybox:1.37 --overrides='{"spec":{"volumes":[{"name":"a","persistentVolumeClaim":{"claimName":"training-archive"}}],"containers":[{"name":"fetch","image":"busybox:1.37","stdin":true,"command":["tar","cf","-","-C","/a","<day>"],"volumeMounts":[{"name":"a","mountPath":"/a"}]}]}}' \
  | tar xf - -C ../training-archive
```

A failed shard (after `backoffLimitPerIndex` retries) fails the Job and no merge happens; the other shards stay
in `_shards/<day>/<run>/`. Re-run that seed range by hand into the same shard folder, then run `jobs/collect`
with the run's name, day, scenario and kind.

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
