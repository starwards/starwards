# Dradis Screen (Relay)

**Status:** Partial — the screen has shipped ([PR #1934](https://github.com/starwards/starwards/pull/1934)): dradis radar, waypoint placement/selection/edit layers, waypoint collections with visibility toggles, and radar layer controls (see `modules/browser/src/screens/relay.ts`). Probes and inter-ship route coordination are not yet built.
**Crew role:** Relay — the long-game comms officer who runs this screen. In a short bridge game there is no dedicated Relay seat; SIGINT runs Dradis alongside Signals instead.
**Blocked by (remaining scope):** Probe system, Astrogator station
**Issues:** [#1211](https://github.com/starwards/starwards/issues/1211), [#1209](https://github.com/starwards/starwards/issues/1209)

## What it does

Dradis is the ship's longest-range live picture: a faction-wide field of view for strategic call-outs, points of interest, and simple paths — as distinct from the Pilot's short-range tactical radar on Helms. Whoever runs it (SIGINT in a short game, the Relay officer in a long game) extends the ship's awareness through probes and coordinates navigation waypoints for the Pilot to execute.

Navigation is split across three roles: the Astrogator plans warp-frequency routes off-bridge and post-event; Dradis marks and directs waypoints live during play; the Pilot executes them on Helms. Warp itself is a separate mechanic, not part of navigation.

## Key features

- **Probe network:** Launch small mobile sensors to extend radar coverage. Fuel-limited lifespan, directional launch.
- **Route library:** Receive routes from the Astrogator, store and forward to the Pilot.
- **Waypoint management:** Create, edit, and organize navigation waypoints with layer toggles.
- **Multi-ship coordination:** Share routes and waypoints with other ships in the fleet.

## Widgets

- Dradis radar with probe coverage overlay
- Waypoint management interface (create/select/delete, layer toggles)
- Route list with names and efficiency ratings
- Probe launch controls (direction, velocity)
- Quick share buttons for routes

## What's already built

- Waypoint layer toggle system ([#1185](https://github.com/starwards/starwards/issues/1185) — done)
- Waypoint CRUD on radar

## Dependencies

1. Probe system (new mechanic — mobile sensors with fuel/lifespan)
2. Astrogator station (routes to receive and forward)
3. Dradis radar widget ([#1209](https://github.com/starwards/starwards/issues/1209))
4. Then the full screen ([#1211](https://github.com/starwards/starwards/issues/1211))
