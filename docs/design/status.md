# Feature Status

Last updated: 2026-04-14

## Currently In Progress

- **[#1206](https://github.com/starwards/starwards/issues/1206)** — Signals jobs system (MS3 critical path)
- **[#1239](https://github.com/starwards/starwards/issues/1239)** — Composition over inheritance in ship-state (architectural refactor)
- **[#1847](https://github.com/starwards/starwards/issues/1847)** — GM command makes ship un-pilotable (bug fix)

## Stations

| Station | Status | Key Issues | Notes |
|---------|--------|------------|-------|
| [Pilot](stations/pilot.md) | Done | — | Flight control, physics, helm assist, two flight modes |
| [Weapons](stations/weapons.md) | Done | [#1002](https://github.com/starwards/starwards/issues/1002) | ChainGun, torpedoes, targeting. Railgun not yet implemented |
| [ECR / Engineering](stations/ecr.md) | Done | — | Power, heat, coolant, system health management |
| [GM Screen](stations/gm.md) | Partial | — | Widget system works; scenario tools incomplete |
| [Signals](stations/signals.md) | Designed | [#1208](https://github.com/starwards/starwards/issues/1208), [#1206](https://github.com/starwards/starwards/issues/1206) | Blocked on scan levels + signals jobs |
| [Navigator](stations/navigator.md) | Designed | [#1261](https://github.com/starwards/starwards/issues/1261), [#1262](https://github.com/starwards/starwards/issues/1262) | Blocked on warp topology |
| [Relay](stations/relay.md) | Designed | [#1211](https://github.com/starwards/starwards/issues/1211), [#1209](https://github.com/starwards/starwards/issues/1209) | Blocked on probes + navigator |

## Game Mechanics

| Mechanic | Status | Key Issues | Notes |
|----------|--------|------------|-------|
| [Newtonian flight](mechanics/movement.md) | Done | — | Full physics, collision detection, drift recovery |
| [Warp drive](mechanics/movement.md) | Partial | [#1182](https://github.com/starwards/starwards/issues/1182) | Basic warp works; frequency topology not built |
| [Armor & damage](mechanics/armor-and-damage.md) | Done | [#788](https://github.com/starwards/starwards/issues/788), [#1187](https://github.com/starwards/starwards/issues/1187) | Sectional armor, penetration, malfunction system |
| [Power distribution](mechanics/armor-and-damage.md) | Done | — | Reactor, system allocation, load balancing |
| [Heat management](mechanics/armor-and-damage.md) | Done | — | Accumulation, dissipation, overheat cascades |
| [Weapons](mechanics/armor-and-damage.md) | Done | [#968](https://github.com/starwards/starwards/issues/968) | ChainGun, torpedoes, blast propagation |
| [Scan levels](mechanics/radar.md) | Designed | — | 3-tier progressive reveal (UFO/Basic/Advanced) |
| [Signals jobs](mechanics/radar.md) | Designed | [#1206](https://github.com/starwards/starwards/issues/1206) | Scan/hack/track job queue |
| [Emissions](mechanics/emissions.md) | Partial | [#1001](https://github.com/starwards/starwards/issues/1001) | System power creates detectable signatures |
| [Radar](mechanics/radar.md) | Partial | [#969](https://github.com/starwards/starwards/issues/969) | Tactical/Dradis work; scan filtering not built |
| [Docking](mechanics/cargo-and-docking.md) | Designed | [#539](https://github.com/starwards/starwards/issues/539) | Ship-in-ship, compound movement |
| [Cargo](mechanics/cargo-and-docking.md) | Deferred | [#548](https://github.com/starwards/starwards/issues/548) | Post-LARP; not needed for first event |
| Bot AI | Done | — | Tactical orders (MOVE, ATTACK, FOLLOW), idle behaviors |

## Infrastructure

| Area | Status | Key Issues | Notes |
|------|--------|------------|-------|
| [Distribution](infrastructure/distribution.md) | Partial | [#1295](https://github.com/starwards/starwards/issues/1295), [#832](https://github.com/starwards/starwards/issues/832) | pkg.js builds work; versioned downloads not done |
| [Scenario loading](infrastructure/scenarios.md) | Planned | [#870](https://github.com/starwards/starwards/issues/870) | TypeScript scenario files loaded from disk |
| [Networking](infrastructure/networking.md) | Done | — | Colyseus multiplayer, LAN-ready |
| Node-RED integration | Done | [#1294](https://github.com/starwards/starwards/issues/1294) | IoT bridge via colyseus-events |
| E2E testing | Done | — | Playwright test suite |

## Quality & Polish

| Item | Status | Issue |
|------|--------|-------|
| Logger instead of console | Open | [#1018](https://github.com/starwards/starwards/issues/1018) |
| Screen overflow/scrollbars | Open | [#958](https://github.com/starwards/starwards/issues/958) |
| Collapsible side pane | Open | [#881](https://github.com/starwards/starwards/issues/881) |
| Keys configuration | Open | [#834](https://github.com/starwards/starwards/issues/834) |
| Shortcut tips | Open | [#1846](https://github.com/starwards/starwards/issues/1846) |
| Usage instructions | Open | [#835](https://github.com/starwards/starwards/issues/835) |
