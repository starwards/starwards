---
audience: both
depth: light
related:
  - LLM_CONTEXT.md
  - ARCHITECTURE.md
  - TECHNICAL_REFERENCE.md
last_verified: 2026-08-17
---

# Glossary

The single place Starwards domain and codebase terms are defined. Every entry is one line
and links to the doc or source file that owns the real explanation — this table never
explains a mechanic itself, so a mechanic never drifts out of sync between two places.

## Bridge stations

| Term | Meaning | Where it lives |
|---|---|---|
| Pilot | Station for ship movement/navigation | [`modules/browser/src/screens/pilot.ts`](../modules/browser/src/screens/pilot.ts) |
| Weapons | Station for chain gun and tube (torpedo) control | [`modules/browser/src/screens/weapons.ts`](../modules/browser/src/screens/weapons.ts) |
| Engineer | Station for reactor, thrusters, and system repair | [`modules/browser/src/screens/engineer.ts`](../modules/browser/src/screens/engineer.ts) |
| GM | Game-master station: scenario control, GM radar, per-property tweak panel | [`modules/browser/src/screens/gm.ts`](../modules/browser/src/screens/gm.ts) |
| Signals | Station for scanning/identifying contacts | [`modules/browser/src/screens/signals.ts`](../modules/browser/src/screens/signals.ts) |
| Relay | Station relaying radar/comms between crew | [`modules/browser/src/screens/relay.ts`](../modules/browser/src/screens/relay.ts) |
| Navigator | Specified crew position with no screen in the codebase — design-only | [`design/stations/navigator.md`](design/stations/navigator.md) |

## World & state

| Term | Meaning | Where it lives |
|---|---|---|
| SpaceObjectBase | Abstract base for every object placed in the world (id, position, velocity, angle, faction, …) | [`modules/core/src/space/space-object-base.ts`](../modules/core/src/space/space-object-base.ts) |
| SpaceState | Root Colyseus schema holding all space objects, accessed via `getAll('Type')` | [`modules/core/src/space/space-state.ts`](../modules/core/src/space/space-state.ts) |
| ShipState | Per-ship schema: reactor, thrusters, chain gun, radar, armor, tubes, warp | [`modules/core/src/ship/ship-state.ts`](../modules/core/src/ship/ship-state.ts) |
| SpaceManager | Physics/collision engine driving space object movement each tick | [`modules/core/src/logic/space-manager.ts`](../modules/core/src/logic/space-manager.ts) |
| GameManager | Server-side orchestrator of rooms/scenarios/players | [`modules/server/src/admin/game-manager.ts`](../modules/server/src/admin/game-manager.ts) |
| AdminRoom | Colyseus room for game management (scenario start/stop, GM state) | [`modules/server/src/admin/room.ts`](../modules/server/src/admin/room.ts) |
| SpaceRoom | Colyseus room for the shared world/gameplay state | [`modules/server/src/space/room.ts`](../modules/server/src/space/room.ts) |
| ShipRoom | Colyseus room for one ship's control state (roomId = shipId) | [`modules/server/src/ship/room.ts`](../modules/server/src/ship/room.ts) |
| Faction | Enum identifying which side an object/player belongs to | [`modules/core/src/space/faction.ts`](../modules/core/src/space/faction.ts) |
| warp | `Warp` ship system driving the warp-drive mechanic | [`modules/core/src/ship/warp.ts`](../modules/core/src/ship/warp.ts) |

## Perception

| Term | Meaning | Where it lives |
|---|---|---|
| ScanLevel | How much a viewer knows about a scanned object: `UFO` < `BASIC` < `SNAPSHOT` < `FULL` | [`modules/core/src/space/scan-level.ts`](../modules/core/src/space/scan-level.ts) |
| playerScanLevel | Computes a viewer's `ScanLevel` for an object given their faction | [`modules/core/src/client/space-object-intel.ts`](../modules/core/src/client/space-object-intel.ts) |
| FieldOfView | Core visibility/line-of-sight index shared by server and client | [`modules/core/src/logic/field-of-view.ts`](../modules/core/src/logic/field-of-view.ts) |
| RadarRangeFilter | Client-side filter a radar recomputes to drop blips outside its field of view | [`modules/browser/src/radar/blips/radar-range-filter.ts`](../modules/browser/src/radar/blips/radar-range-filter.ts) |
| radar (long-range vs tactical) | Separate widgets rendering different radar scopes on different stations | [`modules/browser/src/widgets/long-range-radar.ts`](../modules/browser/src/widgets/long-range-radar.ts), [`modules/browser/src/widgets/tactical-radar.ts`](../modules/browser/src/widgets/tactical-radar.ts) |

## Ship systems & damage

| Term | Meaning | Where it lives |
|---|---|---|
| HackLevel | Multiplier applied by a system's hacked state: `OK`=1, `COMPROMISED`=0.5, `DISABLED`=0 | [`modules/core/src/ship/system.ts`](../modules/core/src/ship/system.ts) |
| coolantFactor | Tweakable factor governing a system's heat dissipation, not its effectiveness | [`modules/core/src/ship/system.ts`](../modules/core/src/ship/system.ts) |
| effectiveness | `SystemState.effectiveness`: `broken ? 0 : power * hacked` | [`modules/core/src/ship/system.ts`](../modules/core/src/ship/system.ts) |
| armor plate | `Armor`/`ArmorPlate` model hull armor as a ring of plates with per-damage-type erosion factors | [`modules/core/src/ship/armor.ts`](../modules/core/src/ship/armor.ts) |

## Code mechanisms

| Term | Meaning | Where it lives |
|---|---|---|
| `@gameField` | Decorator marking a property for Colyseus sync to clients (must be innermost decorator) | [`modules/core/src/game-field.ts`](../modules/core/src/game-field.ts) |
| JSON Pointer command | `room.send({type: '/path/to/prop', value})`, addressing state dynamically | [`json-ptr.md`](json-ptr.md) |
| StateCommand | Interface for a named, path-addressable command that mutates room state via `setValue` | [`modules/core/src/commands.ts`](../modules/core/src/commands.ts) |
| `@tweakable` | Decorator exposing a field to the GM tweak panel | [`modules/core/src/tweakable.ts`](../modules/core/src/tweakable.ts) |
| `@range` | Decorator constraining a numeric field's value range (static or dynamic) | [`modules/core/src/range.ts`](../modules/core/src/range.ts) |
| `@defectible` | Decorator tagging a `SystemState` field as damage-report/GM-tweak-panel visible | [`modules/core/src/ship/system.ts`](../modules/core/src/ship/system.ts) |
| Colyseus Monitor | `@colyseus/monitor` dashboard mounted at `/colyseus-monitor` for room inspection | [`modules/server/src/server.ts`](../modules/server/src/server.ts) |
| Dashboard vs fixed station layout | `Dashboard` (golden-layout, customizable screens) vs `wrapRootWidgetContainer`/`subContainer` (fixed-grid stations) — the two layout systems don't mix | [`modules/browser/src/widgets/dashboard.ts`](../modules/browser/src/widgets/dashboard.ts), [`modules/browser/src/container.ts`](../modules/browser/src/container.ts) |

## UI terms

| Term | Meaning | Where it lives |
|---|---|---|
| Blip | Rendered mark for one space object on a radar | [`modules/browser/src/radar/blips/blip-renderer.ts`](../modules/browser/src/radar/blips/blip-renderer.ts) |
| Widget | Self-contained UI component (panel, radar, display) mounted into a container | [`modules/browser/src/widgets/`](../modules/browser/src/widgets/) |
| Driver | Client-side wrapper over synced room state (`ShipDriver`, `SpaceDriver`) | [`modules/core/src/client/driver.ts`](../modules/core/src/client/driver.ts) |
| Tweakpane pane | Control panel built with `createWidgetPane`, the standard property surface | [`modules/browser/src/panel/widget-pane.ts`](../modules/browser/src/panel/widget-pane.ts) |
| `PropertyPanel` | Panel API predating Tweakpane blades, still used by `design-state` and `gun` widgets | [`modules/browser/src/panel/property-panel.ts`](../modules/browser/src/panel/property-panel.ts) |
| Spatial index | Acceleration structure for fast positional object queries | [`modules/core/src/client/spatial-index.ts`](../modules/core/src/client/spatial-index.ts) |
| Defectible | A field of a `SystemState` that damage can degrade and the damage report shows | [`modules/core/src/ship/system.ts`](../modules/core/src/ship/system.ts) |
| SBS | Space Bridge Simulator — the station-screen product this UI serves | [`UI_SPECIFICATION.md`](UI_SPECIFICATION.md) |
