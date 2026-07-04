# Roadmap

> **See also:** [`docs/MS3/PLAN.md`](../MS3/PLAN.md) — the detailed engineering breakdown that this roadmap supersedes in *strategic scope* (now 4-station ship-early per [decision 004](decisions/004-ship-early-expand-later.md)) but not in *phase detail*. PLAN.md retains task-level breakdowns and risk analysis for the full vision.

## Current Phase: Milestone 3 — LARP Event Ready

**Goal:** Run a full Helios LARP event with Starwards replacing EmptyEpsilon.
**Status:** In progress — see the live count on the [MS3 milestone](https://github.com/starwards/starwards/milestones) / [open issues](https://github.com/starwards/starwards/issues).

## Strategy: Ship Early, Expand Later

The full MS3 vision includes 6 new stations, warp topology, probes, and repair — ambitious for a 2-person team with day jobs. Rather than building everything before running an event, the roadmap is split into a **shippable core** and **expansion content**.

**Shippable core (4-station bridge):** Pilot, Weapons, ECR, Signals + GM. This is a real game — it adds intelligence/cyber warfare on top of flight and combat, and the scan levels mechanic enriches radar for all stations.

**Expansion (post-first-event):** Navigator, Relay, repair system, warp topology. These are better designs than EE equivalents, but the game is playable without them. Real playtesting will reveal whether they're needed for the *next* event or whether the 4-station bridge is already sufficient.

## Priority Order

Work items ordered by "what unblocks a playable event soonest":

### Tier 1: Currently In Progress
- [x] **#1847** — Fix GM command breaking pilot control (bug)
- [x] **#1239** — Composition over inheritance in ship-state (refactor, simplifies #1206)
- [x] **#1206** — Signals jobs system (scan/hack/track queue — MS3 critical path)

### Tier 2: Minimum Playable Event
| Priority | Item | Why |
|----------|------|-----|
| 1 | **Ship models** ([#546](https://github.com/starwards/starwards/issues/546)) | Can't crew a corvette without corvette ships |
| 2 | **Docking** ([#539](https://github.com/starwards/starwards/issues/539)) | Stations are ships; repair/resupply requires docking |
| 3 | **Signals station UI** ([#1208](https://github.com/starwards/starwards/issues/1208)) | Wire up the jobs system to a playable station |
| 4 | **Pre-event bugs** ([#866](https://github.com/starwards/starwards/issues/866), [#1002](https://github.com/starwards/starwards/issues/1002), [#748](https://github.com/starwards/starwards/issues/748)) | Things that will break during play |
| 5 | **Scenario file loading** ([#870](https://github.com/starwards/starwards/issues/870)) | Externalize maps so organizers can author scenarios |
| 6 | **Room lifecycle** ([#1238](https://github.com/starwards/starwards/issues/1238)) | Stale rooms during multi-hour event = chaos |
| 7 | **Usage docs** ([#835](https://github.com/starwards/starwards/issues/835)) | Players need onboarding |

### Tier 3: Expansion (post-first-event)
- [ ] **Warp frequency topology** ([#1182](https://github.com/starwards/starwards/issues/1182)) — procedural efficiency zones
- [ ] **Navigator station** ([#1261](https://github.com/starwards/starwards/issues/1261)) — route plotting through warp topology
- [ ] **Relay station** ([#1211](https://github.com/starwards/starwards/issues/1211)) — probes, route coordination
- [ ] **Repair system** — 3-tier system, Node-RED integration
- [x] **Hull damage** ([#1187](https://github.com/starwards/starwards/issues/1187)) — IoT alerts
- [ ] **Scan minigame** ([#939](https://github.com/starwards/starwards/issues/939))
- [ ] **Cargo system** ([#548](https://github.com/starwards/starwards/issues/548))

### Pre-Event Gate
Before the first event, regardless of which tier items are done:
- [ ] Multi-bridge stress test (3+ ships x 5 crew)
- [ ] Full scenario dry run with crew
- [ ] GM workflow rehearsal
- [ ] Fallback plan (EmptyEpsilon is still available)

## Critical Dependencies

```
Scan Levels (#1205)
  └─► Signals Jobs (#1206)
       └─► Signals Station (#1208)

Warp Topology (#1182)
  └─► Navigator Radar (#1262)
       └─► Navigator Station (#1261)

Docking (#539)
  └─► Dock Master (#538)
       └─► Repair features
```

## History

| Period | Milestone | Key Deliverable |
|--------|-----------|----------------|
| 2021 Q1 | MS1: Dogfight | Combat between two fighters — piloting, weapons, physics |
| 2021 Q2 | MS2: Damage | Engineering systems, armor, malfunctions, power/heat |
| 2022 | Station screens | Pilot, Weapons, ECR screens; warp; docking; Node-RED; ammo |
| 2023 H1 | ECR completion | Power allocation, coolant, armor widget |
| 2024 | Consolidation | Removed 3D view, fixed armor, bot AI rewrite, GM tools |
| 2025 | Sustainability | AI-assisted dev workflow, Playwright E2E, extensive docs |
| 2026 | MS3: Event Ready | Three new stations, scan levels, warp topology, docking |

## Post-Event Backlog
Features explicitly deferred until after the first LARP event:
- Navigator + Relay stations (warp topology, probes, route coordination)
- Repair system (3-tier, IoT integration)
- Cargo system ([#548](https://github.com/starwards/starwards/issues/548))
- Fighters as playable ships (currently only NPC)
- 3D visualization (separate Unity client)
- Scan minigame ([#939](https://github.com/starwards/starwards/issues/939))
