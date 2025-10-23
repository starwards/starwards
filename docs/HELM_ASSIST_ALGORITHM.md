# Helm Assist Algorithm Analysis

## `accelerateToPosition` - Position Control Algorithm

### Overview
The `accelerateToPosition` function implements a predictive braking controller that attempts to bring a ship to a target position with zero velocity. It uses a combination of three control strategies depending on the ship's state.

### Algorithm Phases

#### Phase 1: Low-Velocity Proportional Control
**Activation Conditions:**
- `absVelocity < pinPointVelocity * 0.5` (velocity is less than half the predictive threshold)
- `targetDistance < stopDistance * 2` (ship is within twice its natural braking distance)

**Behavior:**
- Uses gentle proportional control: `controlStrength = targetDistance / (stopDistance * 2)`
- Output range: `[0, 1]` scaled by direction sign
- **Purpose:** Prevents oscillation in the final approach phase
- **Response:** Linear relationship between distance and thrust

**Why This Works:**
When velocity is low and the ship is close to target, the predictive braking algorithm can overshoot due to:
1. Discrete time steps create quantization errors
2. The min/max break distance range becomes very wide (minBreak → 0, maxBreak → large)
3. Small position errors map to large control outputs

Proportional control provides smoother convergence by reducing control authority as the ship approaches the target.

#### Phase 2: Sign-Based Recovery
**Activation Conditions:**
- `signVelocity !== signRelTarget` (ship is moving away from target)
- Low-velocity zone does NOT apply (Phase 1 has priority)

**Behavior:**
- Returns `signRelTarget` (full thrust toward target)
- Output: `+1` or `-1`
- **Purpose:** Quickly recover from overshoot or initial wrong-direction velocity
- **Response:** Bang-bang control (instant max thrust)

**Critical Insight:**
This phase must come AFTER Phase 1 check. If it comes first, the controller oscillates because:
1. Ship overshoots target slightly with low velocity
2. Sign check triggers full reverse thrust
3. Ship overshoots in opposite direction
4. Cycle repeats indefinitely

#### Phase 3: Predictive Braking
**Activation Conditions:**
- Ship is moving toward target (`signVelocity === signRelTarget`)
- Not in low-velocity zone

**Behavior:**
- Calculates braking distance range:
  - `maxBreakDistance = whereWillItStop(0, absVelocity + pinPointVelocity, -capacity) + pinPointDistance`
  - `minBreakDistance = max(0, whereWillItStop(0, absVelocity - pinPointVelocity, -capacity) - pinPointDistance)`
- Uses linear interpolation: `lerp([minBreak, maxBreak], [-1, 1], targetDistance)`
- **Purpose:** Main control law for smooth deceleration to target
- **Response:** Graduated thrust based on predicted stopping distance

**Physics Behind Predictive Braking:**

The algorithm predicts two scenarios:
1. **Worst case (maxBreak):** Ship accelerates for `pinpointIterationsPredict` iterations, then brakes
   - Adds safety margin to account for control lag
2. **Best case (minBreak):** Ship decelerates for `pinpointIterationsPredict` iterations, then brakes
   - Can go negative when `absVelocity < pinPointVelocity`, clamped to 0

The lerp maps:
- `targetDistance < minBreak` → full reverse thrust (-1)
- `targetDistance > maxBreak` → full forward thrust (+1)
- `minBreak < targetDistance < maxBreak` → proportional thrust

### Response to Parameter Changes

#### Increasing `pinpointIterationsPredict` (currently 2)
**Effect:**
- Widens the `[minBreak, maxBreak]` range
- More conservative braking (earlier deceleration)
- Reduces oscillation risk
- **Trade-off:** Slower approach, may stop short of target

**Tested:** Setting to 3 caused the ship to stop ~50 units short of target at distance=526

#### Decreasing `pinpointIterationsPredict`
**Effect:**
- Narrower braking range
- More aggressive approach
- Higher risk of overshoot
- **Trade-off:** Faster but less stable

#### Adjusting Low-Velocity Threshold (currently 0.5)
**Effect of Increasing (e.g., 0.75):**
- Proportional control activates earlier
- More gentle final approach
- Lower risk of oscillation
- **Trade-off:** Slower convergence from medium distances

**Effect of Decreasing (e.g., 0.25):**
- Proportional control only at very low velocities
- Faster approach
- Higher oscillation risk
- **Trade-off:** May not activate in time to prevent overshoot

#### Capacity (Acceleration) Changes
**High Capacity (fast acceleration):**
- Larger `pinPointVelocity` and `pinPointDistance`
- Wider braking zones
- Low-velocity threshold becomes more selective
- **Observation:** Ships with high acceleration need Phase 1 control more

**Low Capacity (slow acceleration):**
- Smaller safety margins
- Tighter control
- Less prone to oscillation naturally
- **Observation:** Slower ships are more forgiving

### Edge Cases and Failure Modes

#### 1. Oscillation (Fixed)
**Condition:** Low velocity near target with sign changes
**Original Bug:** Phase 2 came before Phase 1
**Symptom:** Ship bounces between ±5 units of target
**Fix:** Reorder control phases so proportional control has priority

#### 2. Stop Short
**Condition:** Very conservative settings or low afterburner
**Symptom:** Ship stops 10-50 units before target
**Cause:** `maxBreakDistance` overestimated, ship decelerates too early
**Mitigation:** Not a critical issue, ship will slowly crawl to target

#### 3. Velocity Blow-Through
**Condition:** Very high initial velocity, target very close
**Symptom:** Ship flies past target at high speed
**Cause:** `maxBreakDistance < targetDistance` continuously
**Mitigation:** Sign-based recovery (Phase 2) will eventually catch it

#### 4. Zero Capacity
**Condition:** `capacity = 0` (no thrust available)
**Symptom:** Division by zero in `whereWillItStop`
**Result:** Returns `Infinity`, control saturates to ±1
**Status:** Unlikely in practice (dead ship)

### Performance Characteristics

**Time to Target (empirical from test case):**
- Distance: 526 units
- Capacity: 594 units/s²
- Max speed: 447 units/s
- Iterations: 62 (3.1 seconds at 20 Hz)
- **Efficiency:** Near-optimal for given constraints

**Final Error (after stabilization):**
- Typical: 1-3 units (with Phase 1 fix)
- Maximum observed: 5.27 units (before fix)
- Tolerance: 5.13 units (sqrt error margin)

**Convergence Rate:**
- Initial phase: Exponential approach
- Final phase: Linear (proportional control)
- Stabilization: 2× time-to-reach needed

### Tuning Recommendations

**For Faster Approach (accepting more overshoot):**
- Decrease low-velocity threshold: `0.5 → 0.3`
- Decrease `pinpointIterationsPredict`: `2 → 1.5` (fractional values work)

**For Smoother Approach (minimizing overshoot):**
- Increase low-velocity threshold: `0.5 → 0.7`
- Increase `pinpointIterationsPredict`: `2 → 2.5`

**For Different Ship Types:**
- **Heavy/slow ships:** Can use more aggressive settings (lower thresholds)
- **Light/fast ships:** Need conservative settings (higher thresholds)
- **Afterburner consideration:** High afterburner increases effective capacity, may need threshold adjustment

### Multi-Axis Behavior

When used for 2D control (`moveToTarget`):
- Each axis (boost/strafe) controlled independently
- X and Y axes may converge at different rates
- Final position depends on slower axis
- **Coupling effect:** Ship angle affects local velocity decomposition

### Testing Insights

**Property-Based Testing Revealed:**
- Algorithm stable across wide range of distances (250-2000 units)
- Afterburner variation (0-0.5) exposes edge cases
- Failure rate: ~1% before fix, 0% after fix (93 test iterations)
- **Critical test:** `fromX = -526.41, afterburner = 0.49` (minimal reproducer)

**Why This Test Failed:**
1. Specific distance-to-capacity ratio created narrow stability margin
2. Afterburner boost pushed ship into oscillation-prone velocity range
3. Stabilization phase couldn't recover due to Phase 2 override

### Comparison to Alternatives

**PID Controller:**
- **Pros:** Well-understood, tunable, standard
- **Cons:** Requires tuning for each ship, overshoot with high D term
- **Why not used:** Predictive braking is more physically intuitive

**Bang-Bang Controller:**
- **Pros:** Simple, no parameters
- **Cons:** Always oscillates, wear on thrusters
- **Current use:** Phase 2 only (recovery mode)

**Model Predictive Control (MPC):**
- **Pros:** Optimal, handles constraints
- **Cons:** Computational cost, requires ship model
- **Future consideration:** For complex maneuvers

### Future Improvements

1. **Adaptive thresholds:** Scale low-velocity threshold based on ship mass/capacity
2. **Velocity damping:** Add explicit velocity term to Phase 1 control
3. **Jerk limiting:** Smooth thrust changes to reduce mechanical stress
4. **Multi-step prediction:** Extend `pinpointIterationsPredict` dynamically based on velocity
5. **Coordinate with rotation:** Optimize thrust vector when ship isn't perfectly aligned

### Related Functions

- `accelerateToSpeed`: Velocity control (no position feedback)
- `rotateToTarget`: Angular equivalent (similar predictive logic)
- `moveToTarget`: 2D position control (uses this function per axis)
- `matchGlobalSpeed`: Velocity matching in global frame

---

**Last Updated:** 2025-10-23
**Algorithm Version:** 1.1 (with low-velocity proportional control)
**Test Coverage:** 7/7 property-based tests passing
