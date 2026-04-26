# Relay Station

**Status:** Designed (not yet implemented)
**Crew role:** Communications Officer — manages probes, routes, and inter-ship coordination.
**Blocked by:** Probe system, Navigator station
**Issues:** [#1211](https://github.com/starwards/starwards/issues/1211), [#1209](https://github.com/starwards/starwards/issues/1209)

## What it does

The relay officer extends the ship's awareness through probes and coordinates navigation routes between crew members and ships.

## Key features

- **Probe network:** Launch small mobile sensors to extend radar coverage. Fuel-limited lifespan, directional launch.
- **Route library:** Receive routes from Navigator, store and forward to Pilot.
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
2. Navigator station (routes to receive and forward)
3. Relay radar widget ([#1209](https://github.com/starwards/starwards/issues/1209))
4. Then the full station ([#1211](https://github.com/starwards/starwards/issues/1211))
