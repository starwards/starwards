---
audience: both
depth: deep
source_of_truth:
  - docker/osc
  - docker/node-red/osc-bridge-flow.json
  - modules/e2e/test/osc-bridge.spec.ts
related:
  - INTEGRATION.md
  - integration/node-red.md
  - integration/docker.md
  - json-ptr.md
  - DEPENDENCIES.md
last_verified: 2026-08-18
---

# Touch Controllers (Open Stage Control)

## Overview

[Open Stage Control](https://openstagecontrol.ammd.net/) (O-S-C) provides touchscreen and MIDI control surfaces for bridge stations. Tablets connect to an O-S-C server over HTTP; O-S-C widgets send OSC messages over UDP; Node-RED bridges OSC to the Starwards JSON-pointer command surface.

**Core convention: widget OSC address = admitted JSON pointer.**
A fader addressed `/reactor/power` just works — no new server code needed. The existing `@tweakable`/`@commandable` admission layer (see `../json-ptr.md`) enforces safety: writes to non-admitted paths are silently dropped.

## Architecture

```
Tablet (browser, O-S-C client)
    │  HTTP  (session + UI)
    ▼
Open Stage Control server (docker/osc/)
    │  UDP OSC  (widget interactions)
    ▼
Node-RED (docker/node-red/osc-bridge-flow.json)
    ├─ Write path:  udp-in :57120 → osc-decode → ship-write
    └─ Feedback:   ship-read (subscribe) → rate-limit → osc-encode → udp-out → O-S-C :57120
    │
    ▼
Starwards game server (ship-write / ship-read)
```

**No changes to core game state or server** — this is a pure infrastructure layer.

## Deployment

Start the `open-stage-control` and `node-red` services from `docker/docker-compose.yml`:

```bash
cd docker
docker-compose up -d open-stage-control node-red
```

O-S-C serves clients on host port **8090** (container port 8080; host 8080 is the game dev server).

The bridge flow is deployed by copying it over Node-RED's active flow file and restarting:

```bash
cp docker/node-red/osc-bridge-flow.json docker/node-red/data/flows.json
docker restart docker-node-red-1
```

The flow's `starwards-config` node points at `http://starwards-server:8080` — an `extra_hosts` alias in `docker-compose.yml` that maps to the docker host (`host-gateway`), where the game server runs.

Node-RED's dependencies (`@starwards/core`, `@starwards/node-red`, `node-red-contrib-osc`) are declared in `docker/node-red/data/package.json` — the same manifest Node-RED's palette manager maintains. The `@starwards` packages aren't on npm, so they are referenced as `file:` tarballs. `npm run node-red` does the whole cycle — builds the tarballs, places them in `data/`, runs the manifest-driven install, and restarts the docker stack:

```bash
npm run node-red   # scripts/dev-node-red.sh
```

The tarballs are gitignored (`*.tgz`), so run this once per fresh clone and whenever the `@starwards` modules change; `node-red-contrib-osc` needs nothing beyond the manifest entry.

## O-S-C Version and Installation

**O-S-C is NOT on npm.** The Docker image (`docker/osc/Dockerfile`) downloads the pure-Node release asset at build time:

```
open-stage-control_1.30.4_node.zip  (pinned; see ../DEPENDENCIES.md)
```

The zip extracts to `open-stage-control_<version>_node/` with `index.js` as the entry point. The node package is inherently headless — no Electron, virtual framebuffer, or `--no-gui` flag needed. The container starts it with `--send node-red:57120` so widget interactions go to Node-RED's UDP-in by default (no per-widget `target` needed), and `--remote-root /sessions` so the in-app Session → Open dialog browses the mounted sessions dir instead of the server's working dir.

## Session Files

Session JSON files live in `docker/osc/sessions/`. Each file maps to a bridge station (e.g. `reactor-demo.json`). Sessions use the modern O-S-C format — `{"version": "1.30.4", "type": "session", "content": {root widget}}`; a bare root widget triggers legacy conversion and an "older version" warning dialog. A widget's OSC `address` field must match an admitted JSON pointer:

```json
{
  "type": "fader",
  "id": "reactor_power",
  "address": "/reactor/power",
  "range": { "min": 0, "max": 1 }
}
```

Widgets need no `target` — the server-level `--send node-red:57120` default covers them. Don't set a widget `value` in the session; current values arrive from the game via the subscription bootstrap.

**Per-client sessions** are routed by the custom module (`docker/osc/modules/starwards-bridge.js`): tablets connect with `?id=<station>` and the module calls `/SESSION/OPEN` to load that station's session.

## Subscription Bootstrap

When a client opens a session, the custom module walks the session JSON (`content` subtree), collects all widget addresses, and — after a 1 s delay so the client finishes loading before the initial values arrive — sends `/starwards/subscribe <address>` messages to Node-RED's subscribe port (`node-red:57121`, via the module-scripting `send()` API). Node-RED routes these to `ship-read` with `{ topic: address, subscribe: true }`.

`ship-read` then:
1. Emits the current value immediately (so widgets show correct state on load)
2. Listens for future state changes and emits them (feedback path)

Dynamic subscriptions are **additive** (multiple addresses accumulate) and **idempotent** (same address subscribed twice → subscribed once).

## Feedback Loop Prevention

Plain inbound OSC matching in O-S-C does **not** re-emit — receiving a value from Node-RED updates the widget display without triggering another send. `/SET` and user interaction do emit. The rate-limit node in the Node-RED flow (a `delay` node in `queue` mode) releases the latest message per address at 25 messages/second — it must stay per-topic, or the burst of initial values on session load loses all but one message.

## Writing a New Session

1. Create `docker/osc/sessions/<station>.json` following the format in `reactor-demo.json` (modern `{version, type, content}` wrapper).
2. Widget `address` must be an admitted JSON pointer (`/system/property`).
3. Read-only widgets (displays) should set `"bypass": true` to prevent them from emitting on user interaction.
4. Faders have no `label` property — label them with sibling `text` widgets (see the labeled columns in `reactor-demo.json`).
5. No restart needed — the sessions directory is volume-mounted and read per session open; just reload the tablet at `?id=<station>`.

## Testing

E2E specs live in `modules/e2e/test/osc-bridge.spec.ts`. They require a live O-S-C instance and are skipped in CI unless `OSC_BRIDGE_URL` is set. The Node-RED flow targets `starwards-server:8080` (the docker host), so the spec's own game server must own host port 8080 — **stop any running dev server first** and run the spec alone:

```bash
docker compose -f docker/docker-compose.yml up -d
OSC_BRIDGE_URL=http://localhost:8090 npm run test:e2e -- osc-bridge.spec.ts
```

The spec reaches Node-RED's UDP inputs through the host-published ports (`57123` → write path, `57121` → subscribe; see `docker-compose.yml`).

The specs cover:
- Write path (fader → UDP → ship state change)
- Feedback path (ship state → widget display via subscribe)
- Multi-controller (two clients see same state)
- Noise budget (rate-limit caps 50 changes/s to 25 packets/s)
- Rejection path (non-admitted write is dropped — state unchanged)

## Key Facts (avoid common mistakes)

| Mistake | Reality |
|---|---|
| `npm install open-stage-control` | Package doesn't exist; Docker image downloads `-node.zip` |
| `--headless` / `--no-gui` flags | The node package is headless by default; no flag needed |
| Node-RED `udp out` without `outport` | Shares the `udp in` socket when ports collide and goes stale on redeploy — set a dedicated `outport` |
| Widget DOM `id` attribute | DOM uses internal hash; Playwright reads via `el._widget_instance.getProp('id')` |
| `?session=x.json` per tablet | Use `?id=<station>` + custom module `/SESSION/OPEN` |
| Feedback loop via udp-out → O-S-C | Plain inbound match never re-emits; only `/SET`/interaction does |
