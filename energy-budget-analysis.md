# Energy Budget Analysis - Issue #2187

## Problem
Energy drops to zero quickly even with reactor at maximum and full cooling (no heat buildup). The ship never reaches a workable steady state.

## Dragonfly MK I Energy Budget

### Energy Generation
- **Reactor Output**: 3 E/s (at max effectiveness)

### Energy Consumption (Baseline Systems Always Running)
- **Omni Radar**: 20,000 range × 0.05 energyCost / 1000 = **1.0 E/s**
- **Scan Beam**: 30,000 range × 0.05 energyCost / 1000 = **1.5 E/s**
- **Total Baseline**: **2.5 E/s**

### Net Energy at Idle
- Generation: 3.0 E/s
- Consumption: 2.5 E/s
- **Net: +0.5 E/s** (barely positive)

### Energy Consumption (Active Operations)

#### Rotation (at full turn, rotation=1.0)
- Formula: `abs(rotation × deltaSeconds × maneuvering.effectiveness × design.rotationCapacity) × design.rotationEnergyCost`
- Calculation: `1.0 × 1.0 × 205 × 0.07 = 14.35 E/s`
- **Result: -11.35 E/s net** (deep deficit)

#### Forward Thrust (at full boost, boost=1.0)
- Formula: Per thruster `desiredAction × (capacity × effectiveness × deltaSeconds) × energyCost`
- One forward thruster: `1.0 × 300 × 0.07 = 21 E/s`
- **Result: -18.5 E/s net** (severe deficit)

#### Afterburner Charge (charging from empty)
- Formula: `afterBurnerFuelDelta × design.afterBurnerEnergyCost`
- Calculation: `20 × 0.07 = 1.4 E/s`
- **Result: -0.9 E/s net** (slight deficit)

#### Chain Gun Firing (8 rounds/sec)
- Formula: `bulletsPerSecond × energyCost`
- Calculation: `8 × 1 = 8 E/s`
- **Result: -5.5 E/s net** (deficit)

## Root Cause Analysis

### The Problem
The reactor generates **3 E/s** but basic operations consume far more:
- Idle (radars only): 2.5 E/s → **0.5 E/s surplus** (marginal)
- Any rotation: +14.35 E/s → **-11.35 E/s deficit**
- Any thrust: +21 E/s → **-18.5 E/s deficit**
- Firing: +8 E/s → **-5.5 E/s deficit**

A ship cannot maneuver, fire, or even rotate without draining energy faster than it generates.

### Why This Is Broken
1. **Radars consume too much at idle** - 83% of reactor output goes to passive sensors
2. **Movement costs are astronomical** - rotation alone costs 4.8× reactor output
3. **No viable steady state** - any player action creates energy deficit

### Expected Behavior
At max reactor + max cooling, a ship should be able to:
- Maintain radar coverage (baseline)
- Perform basic maneuvering (rotation + thrust)
- Fire weapons intermittently
- Still have net-positive or neutral energy

## Recommendations

### Option 1: Increase Reactor Output (Simplest)
Multiply `energyPerSecond` by 10×:
- Dragonfly MK I: 3 → **30 E/s**
- Would support: idle (2.5) + rotation (14.35) + thrust (21) + firing (8) = 45.85 E/s needed
- Suggests **50 E/s** for comfortable margin

### Option 2: Reduce Energy Costs
- Radar: energyCost 0.05 → **0.005** (10× reduction)
- Rotation: rotationEnergyCost 0.07 → **0.007** (10× reduction)
- Thrusters: energyCost 0.07 → **0.007** (10× reduction)

### Option 3: Hybrid Approach
- Increase reactor: 3 → **15 E/s** (5× increase)
- Reduce costs by 2×:
  - Radar: 0.05 → **0.025**
  - Rotation: 0.07 → **0.035**
  - Thrusters: 0.07 → **0.035**

### Recommended: Option 1 (Scale Up Reactor)
- Least invasive - changes one parameter per ship
- Preserves relative costs between systems
- Easier to balance across ship classes
- Matches player expectation: "more reactor = more power"

## Ship Class Scaling
If we apply 10× reactor scaling across all ships:
- Fighters (Dragonfly): 3 → 30 E/s
- Corvettes: 5 → 50 E/s (estimated)
- Capitals: 10 → 100 E/s (estimated)

This maintains class differentiation while making each viable.

## Code Changes Required
Update `energyPerSecond` in ship configurations:
- `modules/core/src/configurations/dragonfly-mk1.ts`
- `modules/core/src/configurations/dragonfly-mk2.ts`
- `modules/core/src/configurations/cataphract.ts`
- `modules/core/src/configurations/predator.ts`
- `modules/core/src/configurations/glaive.ts`
- `modules/core/src/configurations/gravitas.ts`
- `modules/core/src/configurations/freighter.ts`
- All other ship configs

## Testing
After changes, verify:
1. Ship can idle with radars active without energy drain
2. Ship can perform full rotation + thrust without starving
3. Ship can fire weapons while maneuvering
4. Heat builds up appropriately (separate from energy)
5. Energy starvation occurs only under extreme load (e.g., max warp + max combat)
