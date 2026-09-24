# Movement

> **See also:** [`docs/PHYSICS.md`](../../PHYSICS.md) and [`docs/SUBSYSTEMS.md`](../../SUBSYSTEMS.md) — implementation-level detail on collision physics, thrusters, and warp drive.

## Newtonian Flight (Done)

Ships obey Newton's laws. No artificial drag — velocity is maintained indefinitely. Rotation is independent of movement direction (you can fly one way while facing another).

**Controls:** rotation, boost, strafe, anti-drift, brakes, afterburner.

**Two flight modes:**
- Velocity mode: computer-assisted, set desired velocity vector
- Direct mode: manual thruster control

**Collisions:** Spatial hashing optimization, elastic collision with momentum conservation.

**Drift recovery:** When thrusters are damaged, asymmetric thrust causes drift. Recovery is emergent gameplay — rotate ship to align working thrusters against drift direction.

## Local Obstacle Avoidance (Done)

Ruling 2026-09-22: homing rounds and NPC hulls steer around solids. This is local steering, not graph pathfinding ([#856](https://github.com/starwards/starwards/issues/856) stays parked). It is the counterpart of [Line of Fire](line-of-fire.md), which covers ballistic rounds.

`avoidObstacles` in `modules/core/src/logic/obstacle-avoidance.ts` looks 3 s of travel ahead (at least 1 km) along the path to the destination. The nearest ship, station or asteroid whose body cuts that corridor replaces the destination with the tangent point of the solid, inflated by both radii plus a clearance. The craft passes on the side the path already favours, and re-plans every tick.

- Homing rounds (`SpaceManager` guidance) ignore their target and their shooter. While dodging they over-rotate by the velocity's own heading error, because at top speed, thrust along the hull barely turns the velocity.
- NPC hulls (`AutomationManager.positionNearTarget`) steer only while closing on the target, and never around the target itself.

## Warp Drive (Partial)

Basic warp works — multiplies base speed with charging mechanics and heat generation.

### Warp Frequency Topology (Designed — [#1182](https://github.com/starwards/starwards/issues/1182))

The major planned extension. Space has 10 warp frequencies (Alpha through Kappa), each with a procedurally generated efficiency landscape. Efficiency zones create "terrain" that the Astrogator reads.

**Key parameters:**
- Speed modifier: 0.1x (poor zones) to 2.0x (excellent zones)
- 10 frequencies with distinct characteristics (broad highways, narrow veins, chaotic paths)
- Frequency transitions: 5-second penalty per switch
- Routes provide 20-40% speed advantage over direct paths
- Procedurally generated, deterministic (same position = same topology)

**Implementation needs:** Multi-octave simplex noise, threshold effects for "vein" appearance, A*-variant route optimizer, 100x100 grid sampling at 10 Hz.

This mechanic creates the Astrogator station's entire gameplay loop and is the critical-path blocker for three stations (Astrogator, Relay, and indirectly Signals through crew composition).
