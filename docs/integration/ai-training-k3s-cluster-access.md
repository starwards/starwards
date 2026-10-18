---
audience: both
depth: deep
source_of_truth:
    - deploy/k3s/training
related:
    - ai-training-k3s-handoff.md
    - ai-training-k3s.md
last_verified: 2026-10-18
---

# Training on the home cluster: access for the training manager

You can submit training work to the owner's K3S cluster yourself. Everything below is scoped to one
namespace; the cluster side is owned by the cluster repo (`manifests/35-starwards-training.yaml`), not by
this repository.

## Access

| | |
| --- | --- |
| Kubeconfig | `C:\Users\green\.kube\starwards-training-config` on the workstation (`KUBECONFIG=C:/Users/green/.kube/starwards-training-config`; in Git Bash prefix `kubectl exec` with `MSYS_NO_PATHCONV=1`, or `/training-archive` is rewritten to a Windows path) |
| Namespace | `starwards-training` (the kubeconfig's default) |
| API server | `https://192.168.68.11:6443` (LAN or the owner's Tailscale) |
| Image | `ghcr.io/starwards/starwards/training:<short commit>`, public, no pull secret |
| Archive | the PVC `training-archive` (NFS, ReadWriteMany), mounted at `/training-archive` |

You may: create, update and delete Jobs, CronJobs, pods and ConfigMaps; read pod logs; `exec` into pods;
read events, the quota and the PVC. You may not: read Secrets, or touch anything outside the namespace.
The `jev` Secret (key `TYPESAFE_API_KEY`) exists for Jev jobs; reference it, don't print it.

## Rules the cluster enforces

- **Priority class `starwards-training` is mandatory.** Pods without it are rejected by quota. The
  `params` component adds it; keep `components: [../../params]` in every kustomization.
- **Pod Security `restricted`:** non-root, no privilege escalation, `capabilities.drop: [ALL]`, seccomp
  `RuntimeDefault`. The existing pod templates comply; copy them.
- **Quota:** 3 CPU and 24 GiB memory *requested* in total, 26 GiB memory limits, 8 pods. A pod over quota
  is not created: the Job sits with a `FailedCreate` event (`kubectl get events`) until room frees up.
  That is waiting, not failure.
- **Defaults** for containers without resources: 100m CPU, 256 Mi request, 512 Mi limit.

## How to size work

- Training is a low-priority tenant on spare capacity. Family services always win: under CPU contention
  your pods slow down; a family pod that needs room can evict yours (the shard retries once,
  `backoffLimitPerIndex: 1`). Night runs rarely see either.
- **CPU:** request `500m` per pod, no CPU limit, `WORKERS=4`. Each node has 4 cores; the pod uses every
  idle one.
- **Memory:** request honestly: `WORKERS × 1.5 GiB + 0.5 GiB` (6656 Mi request, 7 Gi limit at 4 workers).
- **One training pod per node** (required anti-affinity in `params`): 3 nodes, so at most 3 shards run
  at once. `parallelism: 3`; more `completions` queue behind them.

## Submitting

```bash
export KUBECONFIG=C:/Users/green/.kube/starwards-training-config
# one-off run (copy a jobs/<job>/ folder and edit; the Job name is the run name)
kubectl create -k deploy/k3s/training/jobs/branch
kubectl get jobs,pods -o wide
kubectl logs -f job/branch-t3-directed      # or a specific pod; -l job-name=<job> for all shards
# re-run under the same name: delete the Job first
kubectl delete job branch-t3-directed
# nightly CronJobs (01:00 suite, 02:00 branch, Europe/Amsterdam)
kubectl apply -k deploy/k3s/training
```

A new build: build and push `ghcr.io/starwards/starwards/training:<short commit>`
(handoff doc, section 1), then change `newTag` in `deploy/k3s/training/params/kustomization.yaml`.

## Reading results

`deploy/archive-reader` mounts the archive read-only:

```bash
kubectl exec deploy/archive-reader -- ls /training-archive/2026-10-19
kubectl exec deploy/archive-reader -- cat /training-archive/2026-10-19/manifest.jsonl
kubectl cp starwards-training/$(kubectl get pod -l app=archive-reader -o name | cut -d/ -f2):/training-archive/2026-10-19 ./archive-2026-10-19
```

`kubectl cp` needs `tar` in the container; busybox has it.

## Retention

A cluster CronJob (`archive-retention`, 12:30 daily) deletes day folders older than 30 days. To keep a day,
put a `README.md` in it (via a Job, since the reader is read-only). It never touches `jev-cache/`.
The archive is not backed up: it is regenerable from code and seeds.
