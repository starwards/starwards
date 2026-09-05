---
audience: both
depth: deep
source_of_truth:
  - .github/workflows/deploy.yml
  - .github/workflows/ci-cd.yml
  - .github/workflows/release.yml
  - .github/k8s/build-preview-images.sh
  - .github/k8s/render-preview.js
  - Dockerfile
  - docker/docker-compose.yml
related:
  - DEVELOPMENT.md
last_verified: 2026-08-17
---

# Deployment

How a commit becomes a running preview environment under `dev.starwards.space`. For
local dev setup, see [`DEVELOPMENT.md`](DEVELOPMENT.md).

## The container image

[`Dockerfile`](../Dockerfile) is a two-stage build:

1. `node:24-bookworm` — `COPY . .`, `npm ci`, `npm run build` (workspace build, `postbuild`
   packs modules into `dist/`), then `cd dist && npm install --omit=dev`.
2. `node:24-bookworm-slim` — copies `dist/` from the build stage only.

The final image sets `ENV PORT=80`, `EXPOSE 80`, and runs
`node node_modules/@starwards/server/cjs/prod.js`. This is the game server image; it is
built from the repo root, not from `docker/docker-compose.yml`.

## CI: Test and Build ([`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml))

Runs on push/PR to `master`. Jobs:

- **Test-Static** — types, format, `build:core`, `depcheck`.
- **Test-Units** — `npm test`, publishes a JUnit report and uploads `unit-test-results`.
- **Test-E2e** / **Test-Visual** — run in the `mcr.microsoft.com/playwright` container;
  skipped (fail-open) when the diff touches only `docs/` or `.md` files. Otherwise build
  core, server, browser, then `npm run test:e2e` / `xvfb-run npm run test:widgets`.
  Test-Visual uploads snapshot diffs on failure.
- **coverage-core** — `npm run test:coverage:core`, uploads `coverage-core`.
- **Build** — full `npm run build`, `npm run pkg` (uploads the Windows executable
  `dist/exec/starwards-win.exe` as artifact "Windows executable"; also boots the
  packaged `dist/exec/starwards-linux` with no env vars and asserts `/health` and `/`
  respond before continuing), `npm run build:unity` (uploads `modules/core/unity-schema`
  as "Unity Schemas").

None of these jobs push a container image or deploy anywhere — that's
[`deploy.yml`](../.github/workflows/deploy.yml).

## Deploy Preview ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml))

Triggers: push to `master`, and PR `opened`/`synchronize`/`reopened`/`closed`. Runs
concurrently per PR (or per `master`), cancelling any in-flight run for the same target.

### 1. `build-push`

- Computes a `release` id: `pr-<N>` for a PR, `master` for a push to `master`. The host
  is `<release>.dev.starwards.space`.
- Builds and pushes the root `Dockerfile` image to GHCR, tagged
  `ghcr.io/<repo>:<12-char sha>` and `ghcr.io/<repo>:<release>`, using
  `docker/build-push-action` with GitHub Actions cache.
- Runs `scripts/prepare-node-red-data.sh` first, so node-red's `/data` manifest has the
  `file:` tarballs it needs before that service's wrapper image is baked.
- Builds and pushes one image per service in [`docker/docker-compose.yml`](../docker/docker-compose.yml)
  via [`.github/k8s/build-preview-images.sh`](../.github/k8s/build-preview-images.sh),
  fed `docker compose config --format json`. Because the cluster can't see the repo's
  bind-mount paths, each compose service with `volumes: type: bind` gets a thin wrapper
  image (`FROM <base or built image>` + `COPY` of every bind-mount source), tagged under
  `ghcr.io/<repo>/preview` with both the commit SHA and the release id. Services with no
  bind mounts and no `build:` section reuse their upstream image unchanged. The script
  also honors two compose labels: `starwards.preview.pre-run` (runs before the `COPY`s,
  for cacheable deps) and `starwards.preview.run` (runs after, for deps on the baked-in
  files).

### 2. `deploy`

Connects to the cluster over Tailscale (`tailscale/github-action`), installs `kubectl`,
then:

- Renders k8s manifests: `docker compose config --format json` piped through
  [`.github/k8s/render-preview.js`](../.github/k8s/render-preview.js) with env
  `RELEASE`, `SERVER_IMAGE` (the game server image from `build-push`), `IMAGES` (the
  compose-service image map), `BASE_DOMAIN=dev.starwards.space`. The renderer emits one
  `Namespace` (`starwards-<release>`), a `Deployment` + `Service` for the game server
  and for every compose service, and a `traefik.io/v1alpha1` `IngressRoute` (+ HTTP→HTTPS
  redirect `Middleware`) for each published TCP port. Compose bind mounts are dropped
  (baked into the wrapper images instead); `volume`/`tmpfs` mounts become `emptyDir`.
- `kubectl apply -f /tmp/manifests.yaml --prune -l app=starwards,release=<release>` with
  an allowlist of `Deployment`, `Service`, `IngressRoute` — prunes objects for compose
  services removed by the branch.
- Copies the cluster's `wildcard-starwards-tls` secret from the `starwards` namespace
  into the preview's own namespace, since Traefik needs the TLS secret local to the
  `IngressRoute`'s namespace.
- `kubectl rollout status` (180s timeout) on every `Deployment` labeled `app=starwards`
  in the namespace.
- Emits the full host list (`render-preview.js --hosts`) as a step output.
- Reports a GitHub Deployment per additional exposed host (`pr-N-<service>`), beyond the
  game server host already reported via the job's `environment:` block.

### 3. `teardown`

Runs when a PR is closed. Deletes the `starwards-pr-<N>` namespace (which removes every
resource in it — all compose services, ingress routes, the copied TLS secret) and
removes the GitHub Deployment environments whose name is `pr-<N>` or starts with
`pr-<N>-`.

## Hostnames

- Game server: `<release>.dev.starwards.space` (`pr-<N>.dev.starwards.space` for a PR,
  `master.dev.starwards.space` for `master`).
- Each compose service with a published TCP port: `<release>-<service>.dev.starwards.space`
  (service name is the compose key, lowercased and sanitized to `[a-z0-9-]`). If a
  service publishes more than one TCP port, each extra port appends its container port:
  `<release>-<service>-<port>.dev.starwards.space`.

## Release ([`.github/workflows/release.yml`](../.github/workflows/release.yml))

On push of a `v*` tag: `npm run build`, `npm run pkg`, then creates a GitHub Release for
that tag with generated release notes and the built `dist/exec/starwards-win.exe` attached
as the release asset `starwards.exe`. This path is independent of the preview deploy — it
does not touch GHCR or the cluster.

## Operating the preview environment

- **Namespace:** `starwards-pr-<N>` for a PR, `starwards-master` for the `master`
  deploy. All resources for that preview live in it.
- **Rollout status:** `kubectl -n starwards-pr-<N> rollout status deploy/<name>` — the
  deploy job runs this per `Deployment` labeled `app=starwards`; list them with
  `kubectl -n starwards-pr-<N> get deploy -l app=starwards`.
- **Logs:** the workflow itself doesn't read pod logs, but since each service is a
  Deployment named after its compose service (or `starwards-server` for the game
  server), `kubectl -n starwards-pr-<N> logs deploy/<name>` follows the usual kubectl
  pattern.
- **Which images are running / manifest shape:** re-render locally with
  `docker compose -f docker/docker-compose.yml config --format json | node .github/k8s/render-preview.js`
  (set `RELEASE`, `SERVER_IMAGE`, `IMAGES` env vars) to see exactly what the deploy job
  applies.
- Cluster access requires the same Tailscale connection and `KUBECONFIG` the workflow
  uses — there's no separately documented access path in these files.
