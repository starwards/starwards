---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/ship
related:
  - PHYSICS.md
  - API_REFERENCE.md
last_verified: 2026-09-03
---

# Ship Subsystems

## Base: SystemState
**Location:** `modules/core/src/ship/system.ts`

**Properties:** `name|design|broken|energyPerMinute|energyStarved|heat:[0,100]|coolantFactor:[0,1]|power:PowerLevel|hacked:HackLevel`

**Computed:** `effectiveness = broken ? 0 : power × hacked` (where HackLevel.OK=1, COMPROMISED=0.5, DISABLED=0; coolantFactor does not affect effectiveness)

**Enums:**
- `PowerLevel: SHUTDOWN=0|LOW=0.25|NORMAL=0.5|HIGH=0.75|MAX=1`
- `HackLevel: DISABLED=0|COMPROMISED=0.5|OK=1`

## Common Properties

| Property | Range | Purpose | Effect |
|----------|-------|---------|--------|
| power | [0,1] | Power allocation | Multiplies effectiveness |
| heat | [0,100] | Thermal load | Overheat damages system |
| coolantFactor | [0,1] | Cooling allocation | Increases heat dissipation |
| hacked | [0,1] | Cyber warfare | Reduces effectiveness |
| broken | boolean | Offline status | Zero effectiveness |
| energyStarved | boolean | Reactor couldn't cover this system's last energy draw | No effectiveness change by itself — `getStatus()` (`system.ts`) reports `STARVED`/`DAMAGED_STARVED` so the crew sees *why* the system did nothing, even when it's otherwise intact |

**Effectiveness:** Output = maxOutput × effectiveness, where `effectiveness = broken ? 0 : power × hacked` (see `SystemState.effectiveness` in modules/core/src/ship/system.ts). `hacked` is a HackLevel multiplier (OK=1, COMPROMISED=0.5, DISABLED=0), so it scales output directly — not as (1-hacked). coolantFactor does not affect output; it only governs heat dissipation in heat-manager.ts.

**Heat:**
- Accumulation: `heat += usageHeat * dt`
- Dissipation: `heat -= (coolantFactor × coolantPerFactor) * dt`
- Overheat: If `heat > 100` → damage → broken

**`energyStarved`:** set by `EnergyManager.trySpendEnergy` (`energy-manager.ts`) on whichever system's draw the reactor couldn't cover, cleared the moment that same draw succeeds again. The `Reactor` itself is the one exception: `EnergyManager.update()` sets `reactor.energyStarved` directly whenever `reactor.energy` reaches zero, since a reactor with nothing left to give may have nothing currently *drawing* from it either — without this it would read as fully healthy on the Full Systems Status panel.

`RepairOperation.energyStarved` (`repair-queue.ts`) is a distinct field on the same concept for the repair queue specifically: true for every tick an ACTIVE operation's declared energy draw fails, from the very first shortfall tick — not only once the sustained shortfall exceeds `ENERGY_STARVATION_GRACE_SECONDS` and the operation actually aborts (see `RepairManager.tickActive`). It's what lets the repair-queue widget show *why* a stalled progress bar isn't moving during that grace window, before `RepairQueue.refusalReason` has anything to say.

## Subsystems Catalog

| System | Location | Key Properties | Notes |
|--------|----------|----------------|-------|
| **Reactor** | `reactor.ts` | energy, effeciencyFactor | Primary energy generation |
| **Maneuvering** | `maneuvering.ts` | afterBurnerFuel, efficiency (design: rotationCapacity, afterBurnerCharge) | Rotation + afterburner control |
| **Thrusters** | `thruster.ts` | fittedBearing, active, afterBurnerActive, availableCapacity, bearingSkew | Directional thrust (Fwd/Back/L/R array); bolted mounts (turnSpeed 0), so `fittedBearing` is what's fixed and `bearing` stays 0 |
| **Radar** | `radar.ts` | arc, bearing, malfunctionRangeFactor | One vision sector each; a ship carries a `radars` collection and sees their union |
| **Turret** | `turret.ts` | fittedBearing, bearing, bearingCommand, bearingSkew, turnSpeedFactor, bearingLimit, bearingLimitFactor | The rotating mount shared by radars, chain guns, tubes and thrusters. `turnSpeed = design.turnSpeed * effectiveness * turnSpeedFactor`; `turnSpeed: 0` is a fixed mount |
| **ChainGun** | `chain-gun.ts` | isFiring, loadAmmo, loading, rateOfFireFactor | Rapid-fire kinetic; ship-level fire trigger drives `isFiring` on every mount that can bear, no safety |
| **Tubes** | `tube.ts` | index, safetyLocked (inherits fittedBearing, loading, rateOfFireFactor, loadedProjectile from ChainGun) | Missile launchers (array); `ShipState.fireTubesCommand` fires every loaded, unlocked tube and re-locks each one that fires |
| **Magazine** | `magazine.ts` | capacity, missiles | Ammo storage |
| **Armor** | `armor.ts` | armorPlates[] (each: layers[] of health/maxHealth), layerDesigns[], numberOfHealthyPlates, numberOfPlates | Sectional damage, layered plate stacks |
| **Targeting** | `targeting.ts` | targetId, shipOnly, enemyOnly, shortRangeOnly | Weapon targeting |
| **Warp** | `warp.ts` | currentLevel, desiredLevel, velocityFactor, damageFactor | FTL travel |
| **Docking** | `docking.ts` | mode, targetId, rangesFactor | Ship-to-ship attach |
| **SmartPilot** | `smart-pilot.ts` | rotationMode, maneuveringMode, rotation, maneuvering | Autopilot |
| **Signals** | `signals.ts` (+ `signals-job.ts`, `signals-job-manager.ts`) | jobs[], jobSuccessFactor, jobSpeedFactor, currentMaxJobs | auto-managed scan job queue, scan levels |

## Pilot Controls
**Location:** `modules/core/src/ship/ship-state.ts`

| Control | Range | Effect |
|---------|-------|--------|
| rotation | [-1,1] | Turn left(-1)/right(1) |
| boost | [-1,1] | Reverse(-1)/forward(1) thrust |
| strafe | [-1,1] | Lateral movement |
| antiDrift | [0,1] | Opposes current velocity |
| breaks | [0,1] | Rapid deceleration |
| afterBurner | [0,1] | Rotation speed boost (high heat) |

**Input mapping:** Keyboard keys and gamepad controls map to these commands via `input-config.ts`. See [Input Configuration System](TECHNICAL_REFERENCE.md#input-configuration-system) for details on step-based keyboard input (0.05 increments) and gamepad axis mapping.

## Bot AI

### Gunnery

Independent of `order`, but not of hull heading (issue #2145).

Every NPC fires on the nearest hostile in its own chain-gun's weapons range by default; whether
the gun *works* never depends on `order`. An `Order.ATTACK` target has priority whenever it's
structurally reachable (in range and within some mount's bearing coverage); only while it isn't
does a free opportunity shot at another hostile happen instead — never in preference to a
reachable ordered target.

A target no mount can currently bear on is *not* simply left alone: gunnery claims the hull
heading to bring a mount to bear, weighted by the ship's flight doctrine (`FlightDoctrine` —
`INTERCEPT` turns readily, `STANDOFF` mostly holds course, `SHADOW` never turns to shoot) and,
under a MOVE order, capped at `MAX_TRANSIT_HEADING_CONCESSION` degrees off the destination bearing
so a bolted-gun NPC takes beam shots without ever flying backwards to reach something behind it.
This never happens under ATTACK/FOLLOW, where the order's own doctrine-driven steering
(`FlightProfile.headingOffset`) already governs heading, and never while some mount can already
bear — the concession releases the instant it's no longer needed.

Whether a mount can be brought to bear is decided against that mount's own firing solution — where
the shell and the target will meet — not against the raw line of sight to the target. The two differ
by tens of degrees against a fast crosser, and the mount is aimed at the solution, so the gate that
decides "commit the swing" now agrees with the aiming it gates.

The shell's fuze is dialled to that same solution. A shot leaves the muzzle, `radius` along the
firing line ahead of the hull centre, so a dialled range of *r* detonates at *r* from the muzzle —
the range the gunner sets, the range the shell flies and the kill-zone ring drawn on the radar all
now describe the same distance. On a large hull this was previously an overshoot of the ship's whole
radius, which is why a big station could miss a target sitting squarely in its envelope.

### Intercept solutions

Both a chain-gun shell and a homing missile have to answer the same question: where will a moving
target be when I get there? `timeToIntercept()` in `modules/core/src/logic/formulas.ts` is that
answer, and it is the only place the math lives.

It solves, for the smallest positive `t`,
`|relativePosition + relativeVelocity · t| = separation + expansionSpeed · t` — a point drifting at
constant velocity meeting a front expanding from the origin. Squaring gives a quadratic in `t`,
solved in closed form for its smallest positive root. Iterative refinement (what this replaced)
diverges once the target's relative speed approaches the interceptor's — exactly the fast-transit
case that needs the answer most. `null` means no positive root: the target outruns the front and is
never reached.

Two callers, each a thin wrapper:

**`solveShellIntercept()`** (`gunner-assist.ts`) answers, for one mount against one target, where to
point and how long the shell must live. A shell leaves the muzzle — `ship.radius` along the firing
line `û`, not the hull centre — at `ship.velocity + bulletSpeed · û`, so after `T` it sits at
`ship.position + (ship.radius + bulletSpeed · T) · û + ship.velocity · T`. Hence `separation` is
`ship.radius` and the velocity is the target's _relative to the firing ship_; the speed is the
_muzzle_ speed, which in the ship's own frame is all the shell has. That is what keeps the fuze, the
aim point and `getKillZoneRadiusRange()` describing the same distance, and makes `T` the fuze setting
directly — the shell's own time of flight, measured from the muzzle. When there is no solution the
result is marked unreachable and degrades to tracking the target's present position, so the hull may
still turn toward it but no caller commits the shot.

**`predictInterceptPoint()`** (`helm-assist.ts`) gives a guidance loop the point to steer at. The
missile's own velocity is not a free parameter here — it flies where it is pointed — so it passes the
target's absolute velocity, zero separation, and its own sprint speed, which is what it will actually
be closing at once on-course. No solution degrades to the target's current position. Steering at
"now" instead of the lead point is what made short-range missiles orbit their target (issue #2189).

### Homing missile guidance

`calcHomingProjectiles()` in `modules/core/src/logic/space-manager.ts` flies every homing projectile.

It steers at `predictInterceptPoint()`'s lead point rather than the target's current position. Aiming
at "now" against a moving target turns the chase into an ever-curving pursuit that can circle the
target instead of ever closing on it — the orbiting bug of issue #2189. The lead is computed at full
sprint speed, since that is what the missile actually closes at once it is on-course.

The terminal sprint is gated on that alignment, not on range alone. At sprint speed the missile's own
turn radius exceeds a short-range engagement, so sprinting while still badly misaligned overshoots
into a wide loop instead of a clean intercept. Gating on alignment keeps the correction phase at
cruise speed's much tighter turn radius.

The controller itself is legacy bang-bang — alignment-threshold branch selection, not true
proportional navigation — and it retains a narrow residual resonance: specific combinations of
relative heading and target speed, roughly 0.3-0.5% of a fine sweep of that input space, where the
missile grazes within ~3% of the proximity fuze radius on every pass without triggering it.
`homing-missile-intercept.spec.ts` pins its fast-check seed for that reason, and eliminating the
resonance needs a different guidance architecture.

### Flight doctrine

`FlightDoctrine` (`modules/core/src/ship/flight-doctrine.ts`) is how a ship weighs gunnery aim
against propulsion efficiency when choosing hull heading and standoff distance.

Each doctrine is a set of `DoctrineWeights` — `aim`, `thrust`, `useGunEnvelope`. The weights
themselves live in `doctrineWeights` in that file; what they buy:

| Doctrine | Behavior |
|----------|----------|
| INTERCEPT | Aim dominates: turns readily to bring a mount to bear, accepting a weak thrust axis to do it |
| STANDOFF | Thrust dominates: mostly holds the efficient heading, giving way only where its thrust cost is already high |
| SHADOW | Ignores gunnery entirely — never turns to shoot, and holds `SHADOW_TRACK_RANGE` instead of a gun envelope |

`ShipState.flightDoctrine` defaults to `AUTO`, which defers to `order` through `doctrineForOrder()`
in `ship-state.ts`:

| Order | Doctrine | Why |
|-------|----------|-----|
| FOLLOW | SHADOW | Station-keeping, not gunnery |
| MOVE | INTERCEPT | Its only use of the profile is `goto()`'s transit concession, already capped at `MAX_TRANSIT_HEADING_CONCESSION`; STANDOFF is too weak there — its aim never outweighs the route heading's own thrust cost on a transit flying its best axis |
| ATTACK, NONE | STANDOFF | Weighs gunnery against propulsion efficiency |

Set `flightDoctrine` explicitly from a scenario or the GM tweak panel for a hull whose armament
doesn't fit its order's default.

### Hull heading arbitration

`FlightProfile` in `modules/core/src/ship/flight-profile.ts` picks the hull-relative heading offset
an NPC holds, scoring a small candidate set: one per mount (parks that mount's fixed bearing on the
firing line), one per thrust direction (puts that direction's local bearing on the vector being
thrust along), plus dead-ahead. Cost is `weights.aim · aimCost + weights.thrust · thrustCost`, both
normalized to [0, 1] and weighted by `doctrineWeights`.

`aimCost` sums how far past its bearing limit each mount would be, as a fraction of a half-circle.
Unscaled, a mount 36° outside its arc scores 0.2 — barely distinguishable from one 18° out, when
both are equally unable to fire; `AIM_COST_SCALE` saturates it at 36° so anything past a modest miss
reads as "cannot bear" outright. `thrustCost` is `1 - velocityCapacity(dir) / maxCapacity` for the
axis nearest the required acceleration, evaluated at the *predicted* hull angle
(`angleOf(shipToTarget) + offset`, `rotateToTarget`'s steady state) — using the current angle closes
the #2083-class feedback loop this arbitration exists to avoid. A ship with no thrust (a station)
scores 0 everywhere, leaving the decision to `aimCost`.

The required-acceleration vector is decided by the same branch of `positionNearTarget` that issues
the thrust command: closing and backing off are direction-of-travel vectors, and arbitrating aim
against one while thrusting along another optimizes a maneuver nobody is flying. In range,
`matchGlobalSpeed` holds a velocity rather than travelling toward anything, so that branch passes
`XY.zero` instead of the velocity-match error (issue #2181): the error swings through every heading
as the match overshoots and the combat weave's own velocity term (#2146) cycles, and arbitrating on
it — rather than declining to make a heading claim — chased the hull through full revolutions.
`bestOffset` reads a zero vector as "no claim" and falls back to line-of-sight, the same path a
doctrine with no mounts already takes.

Hysteresis keeps the choice from chattering. The heading held last tick is rarely reproduced
bit-for-bit — every candidate derived from the target's bearing moves with the target — so the
incumbent is matched by nearest candidate within `HEADING_MATCH_TOLERANCE_DEGREES`, and only one, so
two rivals can't both take the `HEADING_HYSTERESIS_MARGIN` discount. The same tolerance defines
candidate dedup, so a candidate list can never split two headings the hysteresis treats as one.

`commandHeading()` in `automation-manager.ts` measures how fast the commanded heading is itself
sweeping and hands that to `rotateToAngle` as the reference rate to damp against; braking against
absolute turn rate leaves a standing lag the whole pass long for a target crossing abeam. The
measurement is a one-tick finite difference, so a *step* in the command (hysteresis flip, mount
switch, target reacquire) enters it as a rate no sweep could produce. Such a sample is rejected and
the reference re-anchored at rate 0 — clamping would assert the reference really sweeps that fast,
smoothing would add lag to the very term that exists to remove it.

### Believed bearing skew

Issues #2176/#2177. NPC automation never reads `Turret.bearingSkew`. It infers a per-mount belief by comparing where it
last commanded a mount to point against where the mount is observed pointing (`hullBearing`, which
bakes in the real skew), and every bearing decision downstream is expressed in those terms —
`believedRestBearing` / `believedBearingCommandFor` / `believedCanBearAt` in `flight-profile.ts`,
never `Turret.restBearing` / `Turret.bearingCommandFor`, which measure off the true skew. So a fresh
defect first shows up as shots that miss; only once the belief converges does it start ruling
targets out of a mount's traverse.

The comparison is only meaningful once the mount has physically caught up to its last command —
mid-swing the same residual is turn lag, indistinguishable from skew. `AutomationManager` therefore
discards any tick where `bearing` differs from `bearingCommand` by more than
`MOUNT_SETTLED_EPSILON_DEGREES`, and blends the rest into the running belief through an exponential
filter with `BEARING_SKEW_TRACKING_TIME_CONSTANT_SECONDS` (~63% converged after 3s, ~95% after 9s) —
the way a real gunner needs a few seconds of fire to be confident their aim is off, not one glance.

The belief lives in `AutomationManager`, not `ShipState`: it is a brain's guess about an unconfirmed
defect, not a property of the hardware, and a synced field would dirty every tick for every turret on
every ship including player ships, which never run this code.

### Orders (priority: high → low)

| Order | Args | Behavior |
|-------|------|----------|
| NONE | - | Uses idle strategy |
| MOVE | position | Navigate to coords, stop when in tolerance |
| ATTACK | targetId | Pursue target, hold at optimal distance; that target has firing priority (see Gunnery above) |
| FOLLOW | targetId, distance | Formation position, match velocity |

### Idle Strategies

Consulted only while `order === Order.NONE`.

| Strategy | Behavior |
|----------|----------|
| PLAY_DEAD | Holds fire; no automated movement (the default) |
| ROAM | Fires on hostiles like every other idle strategy; wandering movement is **not yet implemented**, so this currently behaves exactly like STAND_GROUND |
| STAND_GROUND | Fires on hostiles; never translates, but will turn the hull to bring a mount to bear (see Gunnery above) |

**Task tracking:** `@gameField('string') currentTask` (human-readable status set by the automation manager, e.g., `"Go to 100,200"`, `"Attack <targetId>"`, `"Follow <targetId>"`, `"Dock at  <targetId>"`, `"Undock from  <targetId>"`; empty string `""` when idle)

### Heat Self-Management (NPC only)

Every NPC tick (`AutomationManager.manageHeat`, gated on `!isPlayerShip` and `deltaSeconds > 0`; player ships are never touched):

- **Coolant:** every system's `coolantFactor` is set to `heat / MAX_SYSTEM_HEAT`, so hotter systems draw a larger share of `HeatManager`'s coolant budget. Runs on a 500ms game-time cadence (not every tick), phase-staggered per ship off the ship's own die so a fleet doesn't all reallocate — and sync their `coolantFactor` — on the same tick.
- **Power backoff:** each chain gun's `power` is hysteresis-latched between `PowerLevel.NORMAL` and `PowerLevel.LOW` — steps down to `LOW` once `heat` reaches 60% of `MAX_SYSTEM_HEAT`, steps back up to `NORMAL` only once it cools below 40%. A duty-cycle throttle between two named `PowerLevel`s (never a raw float — `power`'s declared type is the enum the status UI renders by name), and only ever written for a mount automation has itself latched — a GM- or scenario-set level on a mount that never got hot enough to trigger backoff is left untouched.
- **Ceasefire backstop:** a rare, hysteresis-latched hard stop on `isFiring`, evaluated per mount. Engages at 95% heat, releases only once the mount cools back below 70% — well above where power backoff already engages, so it rarely fires in practice.

## System Interactions

### Power Distribution
```typescript
const totalPower = reactor.output × reactor.effectiveness;
const requestedPower = systems.reduce((sum, sys) => sum + (sys.power × sys.maxPowerDraw), 0);

if (requestedPower > totalPower) {
    const scale = totalPower / requestedPower;
    systems.forEach(sys => sys.actualPower = sys.power × scale);
}
```

### Heat Management
```typescript
const totalCoolant = ship.design.totalCoolant;
const totalCoolantFactors = systems.reduce((sum, sys) => sum + sys.coolantFactor, 0);

systems.forEach(sys => {
    const coolant = (sys.coolantFactor / totalCoolantFactors) × totalCoolant;
    sys.heat -= coolant × dt;
});
```

### Damage Propagation
```typescript
// AttackResolutionManager.resolveWeaponAttack (modules/core/src/ship/attack-resolution-manager.ts)
// delivery + armor engagement + channel split — resolved before any system takes damage
for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {   // front / rear
    // walk armor layers outermost-in; per damage type each layer bypasses,
    // blocks, or engages (plates erode, damage leaks via max(penetration, brokenRatio))
    exposure = walkArmorLayers(damage, areaHitRange);   // 0..1 leak-through
}
// systemScope picks targets: single random system, all in area, or ship-wide electronics
const { hits, damagedExternals } = resolveWeaponAttack(damage);

// DamageManager.takeWeaponDamage (modules/core/src/ship/damage-manager.ts)
// → damageSystem(): amount × exposure walked off in damage50-sized steps,
//   each a probabilistic @defectible roll (capped at 50%) — no direct "broken = true"
for (const hit of hits) damageSystem(hit.system, hit.damage, hit.percentageOfBrokenPlates);
```

## Damage Philosophy

**Malfunction Over Destruction:** Ships don't explode from damage. Systems malfunction, creating handicaps that players must diagnose and mitigate.

- **Soft Problems:** Increase chance of future malfunctions without immediate performance impact
- **Hard Problems:** Directly hinder system performance (e.g., broken thruster causes drift)

**Armor Uniqueness:** Only repairable at shipyards (major LARP event opportunity). Absorbs orders of magnitude more damage than internal systems.

**Thruster Damage Protocol:** When thruster fails, ship experiences asymmetric thrust. Solution:
1. Switch to Direct mode (manual control)
2. Rotate 90° to align working thrusters
3. Return to Velocity mode to counter drift

**Related:** [PHYSICS.md](PHYSICS.md) | [API_REFERENCE.md](API_REFERENCE.md) | [PATTERNS.md](PATTERNS.md)
