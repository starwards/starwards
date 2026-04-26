# Pilot Station

**Status:** Done
**Crew role:** Helmsman — flies the ship.

## What it does

The pilot controls ship movement through Newtonian space. Two flight modes:
- **Velocity mode** — computer-assisted. Set desired velocity vector; autopilot adjusts thrusters.
- **Direct mode** — manual. Pilot controls each thruster axis directly.

Controls: rotation, boost (forward/back), strafe (left/right), anti-drift, brakes, afterburner.

## What's built

- Full Newtonian physics (no artificial drag, momentum conservation)
- Both flight modes with seamless switching
- Helm assist calculations (intercept course, approach vector, orbit path)
- Tactical radar with contact display
- Waypoint navigation
- Collision detection and response

## What's planned

- Warp drive integration with Navigator station (frequency selection on pilot screen)
- Docking approach controls ([#539](https://github.com/starwards/starwards/issues/539))
- Combined Tactical station (pilot + weapons for small crews)

## Gameplay notes

Drift recovery when thrusters are damaged is emergent gameplay — switch to Direct mode, rotate to align working thrusters against drift, apply correction. This is the kind of "malfunction is gameplay" moment the design philosophy targets.
