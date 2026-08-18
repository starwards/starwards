---
audience: both
depth: light
related:
  - LLM_CONTEXT.md
  - AUTHORING.md
last_verified: 2026-07-25
---

# Documentation index

Every folder under `docs/`, what it is for, and whether it describes the system as it is
today. Agents should start at [`LLM_CONTEXT.md`](LLM_CONTEXT.md) (task → doc routing);
read [`AUTHORING.md`](AUTHORING.md) before editing anything here.

**Status** column: **Live** = kept current against the code · **Reference** = external or
vendor material, verify against upstream · **Historical** = describes a past state on
purpose; do not read as current.

## Folders

| Folder | Purpose | Status |
|---|---|---|
| [`design/`](design/README.md) | Product & design KB — vision, stations, mechanics, metrics, decisions, infrastructure. Strategic planning (roadmap/status/backlog) lives in [starwards-design](https://github.com/starwards/starwards-design). | Live |
| [`bridge-playtest/`](bridge-playtest/README.md) | Current playtest cycle: session notes, bridge dynamics, per-station findings, and the `decisions.md` / `proposals.md` inflow. | Live |
| [`specs/`](specs/README.md) | As-built code-structure contracts (state, commands, widgets, ship systems, naming, file organization). | Live |
| [`standards/`](standards/) | Code structure, style, and naming contracts — read before writing core/config code. | Live |
| [`testing/`](testing/README.md) | Testing guide, strategy, harness utilities, UI-testing insights. | Live |
| [`guides/`](guides/FLIGHT_MECHANICS.md) | Player-facing gameplay guides. | Live |
| [`reference/`](reference/README.md) | External/vendor reference dumps (ARWES, Open Stage Control, PixiJS). | Reference |
| [`MS3/`](MS3/README.md) | Milestone 3 design & planning corpus (Nov 2025), superseded strategically by decision 004. | Historical |
| [`retrospectives/`](retrospectives/README.md) | Dated post-implementation retrospectives. | Historical |
| [`superpowers/`](superpowers/specs/2026-08-08-recording-replay-ux-design.md) | Dated UX design specs produced through the superpowers workflow. | Historical |

## Root documents

**Start here (agents)**

| Doc | What |
|---|---|
| [`LLM_CONTEXT.md`](LLM_CONTEXT.md) | Quick reference: patterns, gotchas, task → docs routing. |
| [`AUTHORING.md`](AUTHORING.md) | Rules for writing drift-resistant docs. Read before editing docs. |
| [`GLOSSARY.md`](GLOSSARY.md) | Glossary of domain and codebase terms, each linked to its owning doc/source. |

**Core**

| Doc | What |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design, component relationships. |
| [`DESIGN_PHILOSOPHY.md`](DESIGN_PHILOSOPHY.md) | Core principles, LARP needs. |
| [`PATTERNS.md`](PATTERNS.md) | Code patterns, gotchas, best practices. |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Dev setup, Docker, debugging. |

**Technical**

| Doc | What |
|---|---|
| [`TECHNICAL_REFERENCE.md`](TECHNICAL_REFERENCE.md) | `@gameField`, JSON Pointer, input config. |
| [`json-ptr.md`](json-ptr.md) | JSON Pointer addressing scheme — referenced from ESLint config and core source. |
| [`API_REFERENCE.md`](API_REFERENCE.md) | Endpoints, commands, events. |
| [`SUBSYSTEMS.md`](SUBSYSTEMS.md) | Ship systems, formulas, bot AI. |
| [`PHYSICS.md`](PHYSICS.md) | Physics engine, collision, damage. |
| [`HELM_ASSIST_ALGORITHM.md`](HELM_ASSIST_ALGORITHM.md) | Helm-assist manoeuvring algorithm. |
| [`INTEGRATION.md`](INTEGRATION.md) | Index of integration surfaces: Node-RED, MCP server, Docker, Open Stage Control, MQTT, extending. |
| [`integration/node-red.md`](integration/node-red.md) | Node-RED nodes, example flows, connection lifecycle. |
| [`integration/mcp-server.md`](integration/mcp-server.md) | MCP server seating an LLM at a sandboxed station. |
| [`integration/docker.md`](integration/docker.md) | Docker Compose services for MQTT/Node-RED. |
| [`integration/open-stage-control.md`](integration/open-stage-control.md) | Touchscreen/MIDI control surfaces bridged via Node-RED. |
| [`integration/mqtt.md`](integration/mqtt.md) | Pub/sub bridging for external systems. |
| [`integration/extending.md`](integration/extending.md) | Adding custom widgets, ship systems, space objects. |
| [`DEPENDENCIES.md`](DEPENDENCIES.md) | Version pins and upgrade guide — the only doc that states versions. |
| [`UI_SPECIFICATION.md`](UI_SPECIFICATION.md) | Index of the UI implementation inventory, split per screen under `ui/`. |
| [`ui/pilot-screen.md`](ui/pilot-screen.md) | Pilot screen: widgets, data sources, workflows, pain points. |
| [`ui/engineer-screen.md`](ui/engineer-screen.md) | Engineer screen: widgets, data sources, workflows, pain points. |
| [`ui/weapons-screen.md`](ui/weapons-screen.md) | Weapons screen: widgets, data sources, workflows, pain points. |
| [`ui/gm-screen.md`](ui/gm-screen.md) | GM screen: widgets, data sources, workflows, pain points. |
| [`ui/ship-screen.md`](ui/ship-screen.md) | Ship screen: widgets, data sources, workflows, pain points. |
| [`ui/input-screen.md`](ui/input-screen.md) | Input screen: gamepad testing/debugging widgets. |
| [`ui/common-ui-patterns.md`](ui/common-ui-patterns.md) | Shared UI architecture, Tweakpane/PixiJS/input code patterns, cross-screen technical constraints, glossary. |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Deployment: CI jobs, container image, and the preview environments under `dev.starwards.space`. |

**Project**

| Doc | What |
|---|---|
| [`maintainers.md`](maintainers.md) | Maintainer roster — consumed by `.github/labeler.yml`. |
| [`PROJECT_ANALYSIS.md`](PROJECT_ANALYSIS.md) | Whole-repo structural analysis. |
| [`list-of-approaches.md`](list-of-approaches.md) | Catalogue of techniques used across the codebase. |
