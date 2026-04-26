# Stations

Stations are crew positions on a ship. Each station provides a specific view of the ship's systems and a specific set of controls. The same underlying systems (power, radar, weapons) are accessed through different lenses depending on the station.

## Status Overview

| Station | Status | Crew Role | Primary Systems |
|---------|--------|-----------|----------------|
| [Pilot](pilot.md) | Done | Helmsman | Thrusters, maneuvering, autopilot |
| [Weapons](weapons.md) | Done | Gunner | ChainGun, torpedoes, targeting |
| [ECR](ecr.md) | Done | Engineer | Power, heat, coolant, repairs |
| [GM](gm.md) | Partial | Game Master | Object lifecycle, NPC orders, tweaks |
| [Signals](signals.md) | Designed | Intel Officer | Scan, hack, track jobs |
| [Navigator](navigator.md) | Designed | Navigator | Warp topology, route plotting |
| [Relay](relay.md) | Designed | Comms Officer | Probes, routes, waypoints |

## Station Design Principles

- **Information creates roles.** Pilots see thrust vectors; engineers see power grids. Same ship, different expertise.
- **Minimal interaction.** Screens display; physical controls (joysticks, keys) act. Touchscreen clicks are a last resort.
- **Two layout systems.** Fixed-grid layouts for pre-designed stations; golden-layout for customizable GM/organizer screens.
- **Color system.** Cyan for friendly/own ship; orange for hostile/warnings. Consistent across all stations.
