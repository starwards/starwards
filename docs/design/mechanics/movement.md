# Movement

## Newtonian Flight (Done)

Ships obey Newton's laws. No artificial drag — velocity is maintained indefinitely. Rotation is independent of movement direction (you can fly one way while facing another).

**Controls:** rotation, boost, strafe, anti-drift, brakes, afterburner.

**Two flight modes:**
- Velocity mode: computer-assisted, set desired velocity vector
- Direct mode: manual thruster control

**Collisions:** Spatial hashing optimization, elastic collision with momentum conservation.

**Drift recovery:** When thrusters are damaged, asymmetric thrust causes drift. Recovery is emergent gameplay — rotate ship to align working thrusters against drift direction.

## Warp Drive (Partial)

Basic warp works — multiplies base speed with charging mechanics and heat generation.

### Warp Frequency Topology (Designed — [#1182](https://github.com/starwards/starwards/issues/1182))

The major planned extension. Space has 10 warp frequencies (Alpha through Kappa), each with a procedurally generated efficiency landscape. Efficiency zones create "terrain" that the Navigator reads.

**Key parameters:**
- Speed modifier: 0.1x (poor zones) to 2.0x (excellent zones)
- 10 frequencies with distinct characteristics (broad highways, narrow veins, chaotic paths)
- Frequency transitions: 5-second penalty per switch
- Routes provide 20-40% speed advantage over direct paths
- Procedurally generated, deterministic (same position = same topology)

**Implementation needs:** Multi-octave simplex noise, threshold effects for "vein" appearance, A*-variant route optimizer, 100x100 grid sampling at 10 Hz.

This mechanic creates the Navigator station's entire gameplay loop and is the critical-path blocker for three stations (Navigator, Relay, and indirectly Signals through crew composition).
