# Simulation: physics, combat and resources

Techniques used by the server-side simulation — collision and spatial indexing, the damage model, energy/heat budgeting, and ship control.

## Physics & Space Management

1. **Spatial Indexing with Collision Detection**
    - [`detect-collisions`](../../modules/core/src/logic/space-manager.ts) library
    - Deferred updates via [`toUpdateCollisions`](../../modules/core/src/logic/space-manager.ts) Set
    - Batch processing to minimize index rebuilds
    - Broadphase collision optimization

2. **Clique-Based Attachment System**
    - [`attachments`](../../modules/core/src/logic/space-manager.ts) Map for docking
    - [`calcAttachmentCliques`](../../modules/core/src/logic/space-manager.ts) transitive closure
    - All attached objects move as unit
    - Carrier and formation support

3. **Raycast Optimization for Projectiles**
    - [`raycast`](../../modules/core/src/logic/space-manager.ts) pre-checks collision path
    - Prevents projectiles from tunneling through objects
    - Filter callback for collision eligibility
    - Early termination on hit

4. **Time-Based Garbage Collection**
    - [`gc()`](../../modules/core/src/logic/space-manager.ts) runs every 5 seconds
    - Batch cleanup of destroyed objects
    - [`secondsSinceLastGC`](../../modules/core/src/logic/space-manager.ts) counter
    - Reduces map lookup overhead

5. **Batch Collision Updates**
    - [`toUpdateCollisions`](../../modules/core/src/logic/space-manager.ts) Set aggregates changes
    - Single [`collisions.update()`](../../modules/core/src/logic/space-manager.ts) call per frame
    - Minimizes spatial index rebuilds
    - Position changes batched together

6. **Field of View with Lazy Evaluation**
    - [`FieldOfView`](../../modules/core/src/logic/field-of-view.ts) tracks faction visibility
    - Marked dirty and recomputed only when needed
    - Fog of war implementation
    - Prevents client-side cheating

7. **Client-Side Spatial Index Mirror**
    - [`SpatialIndex`](../../modules/core/src/client/spatial-index.ts) mirrors server collision system
    - [`WeakMap`](../../modules/core/src/client/spatial-index.ts) singleton per driver
    - Event-driven updates via [`on('$add')`](../../modules/core/src/client/spatial-index.ts)
    - Efficient client-side queries

## Damage & Combat Systems

8. **Probabilistic Damage System**
    - [`NormalDistribution`](../../modules/core/src/ship/damage-manager.ts) for hit probability
    - [`damage50`](../../modules/core/src/ship/damage-manager.ts) as median damage threshold
    - CDF-based probability calculation
    - Randomized but balanced outcomes

9. **Arc-Based Damage Distribution**
    - [`shipAreasInRange`](../../modules/core/src/ship/attack-resolution-manager.ts) determines hit zones
    - [`archIntersection`](../../modules/core/src/ship/attack-resolution-manager.ts) calculates overlap
    - Armor plates by angular position
    - Directional damage modeling

10. **System Degradation Pattern**
    - Systems have effectiveness factors that accumulate damage
    - [`effectiveness`](../../modules/core/src/ship/system.ts), `malfunctionRangeFactor`, `bearingSkew`
    - Gradual performance loss vs instant failure
    - Repair vs replace decisions

11. **Predictive Hit Location Algorithm**
    - [`predictHitLocation`](../../modules/core/src/logic/gunner-assist.ts) iterative refinement
    - Accounts for bullet travel time and target motion
    - Converges on intercept point
    - Handles edge cases (max iterations, distance checks)

12. **Kill Zone Calculation**
    - [`getKillZoneRadiusRange`](../../modules/core/src/logic/gunner-assist.ts) determines effective range
    - Accounts for explosion radius and spread
    - [`isTargetInKillZone`](../../modules/core/src/logic/gunner-assist.ts) validates firing solution
    - Prevents wasted ammunition

## Energy & Resource Management

13. **Energy Per Minute (EPM) Tracking**
    - [`EpmEntry`](../../modules/core/src/ship/energy-manager.ts) accumulates energy usage
    - Weighted average calculation with decay
    - [`SECONDS_IN_MINUTE`](../../modules/core/src/ship/energy-manager.ts) normalization
    - Per-system energy monitoring

14. **Heat Management with Proportional Coolant**
    - [`HeatManager`](../../modules/core/src/ship/heat-manager.ts) distributes coolant by factor
    - [`coolantFactor`](../../modules/core/src/ship/heat-manager.ts) per system
    - Even distribution when all factors zero
    - Overheat causes damage at [`MAX_SYSTEM_HEAT`](../../modules/core/src/ship/heat-manager.ts)

15. **Try-Spend Energy Pattern**
    - [`trySpendEnergy`](../../modules/core/src/ship/energy-manager.ts) returns boolean success
    - Automatically generates heat for high-drain systems
    - Energy threshold before heat generation
    - Prevents negative energy values

16. **Afterburner Fuel System**
    - Separate fuel pool from main energy
    - [`maxAfterBurnerFuel`](../../modules/core/src/ship/maneuvering.ts) capacity
    - Recharges over time using energy
    - Speed boost proportional to fuel usage

## Ship Management & Control

17. **Manager Pattern with Dependency Injection**
    - Abstract [`ShipManager`](../../modules/core/src/ship/ship-manager-abstract.ts)
    - [`ShipManagerPc`](../../modules/core/src/ship/ship-manager.ts) and [`ShipManagerNpc`](../../modules/core/src/ship/ship-manager.ts) specializations
    - [`internalProxy`](../../modules/core/src/ship/ship-manager-abstract.ts) for late binding
    - Energy system injected post-construction

18. **States Toggle Pattern**
    - [`StatesToggle`](../../modules/core/src/logic/states-toggle.ts) cycles through legal states
    - [`setLegalState`](../../modules/core/src/logic/states-toggle.ts) dynamically enables/disables options
    - Skips illegal states when toggling
    - Callback on state change

19. **Automation Manager State Machine**
    - [`AutomationManager`](../../modules/core/src/ship/automation-manager.ts) handles AI behaviors
    - [`Order`](../../modules/core/src/ship/ship-state.ts) enum (MOVE, ATTACK, FOLLOW)
    - Task execution with cancellation
    - [`currentTask`](../../modules/core/src/ship/ship-state.ts) string for UI display

20. **Smart Pilot Modes**
    - [`SmartPilotMode`](../../modules/core/src/ship/smart-pilot.ts) enum (VELOCITY, TARGET, DIRECT)
    - Separate rotation and maneuvering modes
    - Mode determines control interpretation
    - Dynamic mode switching based on target availability

21. **Helm Assist Functions**
    - [`moveToTarget`](../../modules/core/src/logic/helm-assist.ts) calculates boost/strafe
    - [`rotateToTarget`](../../modules/core/src/logic/helm-assist.ts) determines rotation
    - [`accelerateToPosition`](../../modules/core/src/logic/helm-assist.ts) with overshoot prevention
    - Physics-based movement prediction

22. **Docking State Management**
    - [`DockingMode`](../../modules/core/src/ship/docking.ts) enum (DOCKED, DOCKING, UNDOCKING)
    - [`DockingManager`](../../modules/core/src/ship/docking-manager.ts) handles transitions
    - Distance and angle threshold checks
    - Attachment system integration
