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
| [`specs/`](specs/) | As-built code-structure contracts (state, commands, widgets, ship systems, naming, file organization). | Live |
| [`standards/`](standards/) | Code structure, style, and naming contracts — read before writing core/config code. | Live |
| [`testing/`](testing/README.md) | Testing guide, strategy, harness utilities, UI-testing insights. | Live |
| [`guides/`](guides/FLIGHT_MECHANICS.md) | Player-facing gameplay guides. | Live |
| [`reference/`](reference/README.md) | External/vendor reference dumps (ARWES, Open Stage Control, PixiJS). | Reference |
| [`MS3/`](MS3/README.md) | Milestone 3 design & planning corpus (Nov 2025), superseded strategically by decision 004. | Historical |
| [`retrospectives/`](retrospectives/) | Dated post-implementation retrospectives. | Historical |

## Root documents

**Start here (agents)**

| Doc | What |
|---|---|
| [`LLM_CONTEXT.md`](LLM_CONTEXT.md) | Quick reference: patterns, gotchas, task → docs routing. |
| [`AUTHORING.md`](AUTHORING.md) | Rules for writing drift-resistant docs. Read before editing docs. |

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
| [`INTEGRATION.md`](INTEGRATION.md) | Node-RED and external integrations. |
| [`DEPENDENCIES.md`](DEPENDENCIES.md) | Version pins and upgrade guide — the only doc that states versions. |
| [`UI_SPECIFICATION.md`](UI_SPECIFICATION.md) | UI specification. |

**Project**

| Doc | What |
|---|---|
| [`maintainers.md`](maintainers.md) | Maintainer roster — consumed by `.github/labeler.yml`. |
| [`PROJECT_ANALYSIS.md`](PROJECT_ANALYSIS.md) | Whole-repo structural analysis. |
| [`list-of-approaches.md`](list-of-approaches.md) | Catalogue of techniques used across the codebase. |
