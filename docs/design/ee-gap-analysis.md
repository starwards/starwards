# EmptyEpsilon Gap Analysis

Feature-by-feature comparison between EmptyEpsilon (EE) and Starwards. Status reflects Starwards implementation state.

**Legend:** Done = implemented, Partial = partially implemented, Designed = spec exists, Planned = on roadmap, Skip = intentionally not implementing, N/A = not applicable

## Crew Stations

| EE Station | Starwards Equivalent | Status | Notes |
|-----------|---------------------|--------|-------|
| Helm | Pilot | Done | Newtonian physics instead of EE's simplified flight |
| Weapons | Weapons | Done | Three engagement circles vs EE's beam weapons |
| Engineering | ECR (Engineering Control Room) | Done | Same power/heat/coolant concept, different UI |
| Science | Signals | Partial | Scan levels + signals jobs replace EE's scan/probe |
| Relay/Comms | Relay | Designed | Route coordination + probes replace EE's hail system |
| — | Navigator | Designed | No EE equivalent; new station for warp topology |
| Main Screen | — | Skip | 2D radar views replace 3D camera; deliberate choice |
| Single Pilot | — | Planned | Combined controls for solo operation |
| Tactical (Helm+Weapons) | — | Planned | Combined station for smaller crews |
| Operations (Science+Comms) | — | Planned | Combined station |
| Damage Control | Part of ECR | Done | Engineering handles damage in Starwards |
| Power Management | Part of ECR | Done | Integrated into engineering station |
| Drone Pilot | — | Skip | No drone system; fighters are NPC-only |
| Dock Master | Part of GM/Relay | Designed | Docking controlled by pilot + GM |

## Weapons & Combat

| EE Feature | Starwards | Status | Notes |
|-----------|-----------|--------|-------|
| Beam weapons (frequency-tuned) | — | Skip | Replaced by three-circle weapon design |
| Homing missiles | Torpedoes | Done | Self-propelled, 720°/s homing, proximity detonation |
| HVLI (kinetic missiles) | — | Skip | ChainGun fills this role |
| Nukes | — | Skip | TPK prevention philosophy; GM controls destruction |
| Mines | — | Planned | Not critical for first event |
| EMP | Hack (via Signals) | Designed | Cyber warfare replaces EMP concept |
| — | ChainGun | Done | No EE equivalent; rapid-fire kinetic weapon |
| — | Railgun | Planned | Medium-range engagement circle |
| Shield frequency tuning | — | Skip | No shields; armor system instead |
| Combat maneuvers (boost/strafe) | Thruster controls | Done | Continuous control vs EE's burst-based system |

## Ship Systems

| EE Feature | Starwards | Status | Notes |
|-----------|-----------|--------|-------|
| Reactor | Reactor | Done | Similar concept |
| Impulse engines | Thrusters | Done | Newtonian instead of simplified |
| Warp drive | Warp drive | Partial | Basic works; topology system designed |
| Jump drive | — | Skip | Warp topology provides strategic travel |
| Front/rear shields | — | Skip | Replaced by sectional armor |
| Maneuver system | Maneuvering | Done | Rotation and afterburner |
| Docking system | Docking | Done | Ship-in-ship, compound movement |
| — | Armor (sectional) | Done | No EE equivalent; directional plates |
| — | Targeting system | Done | Filters: ship-only, enemy-only, range |
| — | Magazine/ammo | Done | Finite ammunition with loading |

## Scanning & Intelligence

| EE Feature | Starwards | Status | Notes |
|-----------|-----------|--------|-------|
| Science scanning (10s charge) | Scan levels (15-60s) | Done | 3-tier vs EE's 2-tier; slower, more meaningful |
| Scan probes | Probes (Relay) | Designed | Mobile sensors extending vision |
| Science database | — | Planned | Ship/object reference data |
| Full spectrum scan | — | Skip | Scan levels provide sufficient depth |
| — | Hack jobs | Planned | No EE equivalent; active cyber warfare ([#1899](https://github.com/starwards/starwards/issues/1899)) |
| — | Track jobs | Designed | Persistent target following |

## Navigation & Movement

| EE Feature | Starwards | Status | Notes |
|-----------|-----------|--------|-------|
| Waypoints | Waypoints | Done | Layer-based toggle system |
| Sector naming | — | Planned | Position-based region identification |
| Terrain (alpha channel) | — | Skip | Warp topology replaces terrain constraints |
| Navigation screen | Navigator station | Designed | Dedicated station vs EE's shared screen |
| — | Warp frequency topology | Designed | No EE equivalent; 10-frequency efficiency zones |

## GM & Scenario

| EE Feature | Starwards | Status | Notes |
|-----------|-----------|--------|-------|
| Lua scenario scripting | — | Planned | No scripting engine yet; scenarios are manual |
| GM ship spawning | Object lifecycle | Done | Create/destroy objects |
| GM comms to players | — | Planned | Text/voice communication |
| Custom GM buttons | — | Planned | Configurable GM actions |
| Difficulty settings | — | Planned | Ship balance tuning |
| Victory/defeat conditions | — | Planned | Event-driven, not automated |
| NPC AI behaviors | Bot AI | Partial | MOVE, ATTACK, FOLLOW, STAND_GROUND, PLAY_DEAD done; ROAM fires on hostiles but its wandering movement isn't built yet ([#2145](https://github.com/starwards/starwards/issues/2145)) |
| Reputation system | — | Skip | LARP narratives don't need mechanical reputation |

## Environment

| EE Feature | Starwards | Status | Notes |
|-----------|-----------|--------|-------|
| Nebulae | — | Planned | [#1188](https://github.com/starwards/starwards/issues/1188) |
| Black holes | — | Planned | Gravitational hazards |
| Worm holes | — | Skip | Warp topology provides travel variety |
| Asteroids | Asteroids | Done | Collision objects |
| Space stations | Space stations (as ships) | Partial | Stations are ships in Starwards |
| Zones | — | Planned | Region-based properties |
| Artifacts | — | Skip | LARP narrative handles special objects |

## Networking & UI

| EE Feature | Starwards | Status | Notes |
|-----------|-----------|--------|-------|
| Multi-crew (2-8 players) | Multi-crew | Done | Colyseus room-based |
| Multi-ship scenarios | Multi-ship | Done | Multiple rooms |
| Alert levels (Green/Yellow/Red) | — | Planned | Visual/audio state changes |
| Self-destruct | — | Skip | TPK prevention; GM decides |
| Ship log | — | Planned | [#878](https://github.com/starwards/starwards/issues/878) |
| — | Customizable screen layouts | Done | Golden-layout drag-and-drop widgets |
| — | Node-RED / IoT integration | Done | No EE equivalent |

## Summary

**Starwards advantages over EE:**
- Newtonian physics, sectional armor, malfunction-over-destruction
- Customizable widget-based station screens
- Dedicated Navigator station with warp topology (novel gameplay)
- Cyber warfare via Signals station (hack/track)
- IoT integration via Node-RED
- Purpose-built for LARP (hours-long play, GM narrative control)

**Key EE features Starwards still needs for parity:**
- Scenario scripting (EE has Lua; Starwards has nothing)
- Environmental objects (nebulae, zones)
- GM-to-player communication
- Alert level system
- Combined stations for smaller crews
