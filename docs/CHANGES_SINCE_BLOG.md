# Changes Since Last Blog Post (June 2022)

*Comprehensive list of features and systems added/changed since the last starwards.github.io blog post*

## Major Architectural Changes

### Removed: 3D Rendering (PR #1659, March 2024)
- **Deleted:** All `modules/browser/src/3d/` files (lights, meshes, objects, particles, skybox, space-scene)
- **Deleted:** `main-screen.ts` (3D main view)
- **Rationale:** Focus effort on core 2D gameplay and systems (blog discussed 3D as experimental)
- **Impact:** Full pivot to 2D-only PixiJS rendering, aligned with productivity goals

### Added: Bot AI System (PR #1640, March 2024)
- **New:** `automation-manager.ts` - AI control for NPC ships
- **Orders:** NONE, MOVE (navigate to position), ATTACK (pursue & fire), FOLLOW (formation)
- **Idle Strategies:** PLAY_DEAD, ROAM, STAND_GROUND
- **GM Control:** Right-click commands for ship positioning and combat (blog only mentioned basic "go to" prototype)

### Added: Waypoint System (PR #1753, May 2024)
- **New:** `waypoint.ts` - Navigation markers in space
- **Features:** Named waypoints, position markers, tactical planning
- **Integration:** GM tools for creating/managing navigation points

## Ship Systems (Not in Blog)

### Energy & Power Management
- **`reactor.ts`** - Primary energy generation system
  - Properties: `energy`, `efficiencyFactor`
  - Dynamic power distribution across all ship systems
  - Formula: `totalPower = reactor.output × reactor.effectiveness`

- **`energy-manager.ts`** - Power allocation logic
  - Handles power scaling when demand exceeds supply
  - Distributes energy proportionally to system `power` settings
  - Real-time energy balance calculations

### Heat Management System
- **`heat-manager.ts`** - Thermal regulation
  - Heat accumulation: `heat += usageHeat * dt`
  - Heat dissipation: `heat -= (coolantFactor × coolantPerFactor) * dt`
  - Overheat damage: `heat > 100 → broken = true`
  - Coolant distribution across all systems (blog mentioned as design concept, now implemented)

### System Effectiveness Formula
- **Implemented:** `effectiveness = broken ? 0 : power × coolantFactor × (1 - hacked)`
- **Applied to:** All ship systems (reactor, thrusters, weapons, radar, etc.)
- **Includes:** Power levels (SHUTDOWN/LOW/MID/HIGH/MAX), coolant allocation, cyber warfare states
- **Blog status:** Was mentioned in design docs but not fully implemented

## Weapons Systems (Major Expansion)

### Missiles & Torpedo Tubes
- **`tube.ts`** - Missile launcher system (completely new)
  - Properties: `angle`, `loaded`, `loading`, `loadTimeFactor`
  - Array of tubes per ship (configurable count)
  - Loading mechanics with time factors

- **`magazine.ts`** - Ammunition storage (new)
  - Properties: `capacity`, `missiles` (current count)
  - Limited ammo requiring resupply

- **Projectile Types** (expanded from basic chaingun):
  1. **CannonShell** - Basic kinetic projectile
     - Small explosion (radius 100, damage 20)
     - Direct-fire weapon

  2. **BlastCannonShell** - Area denial round
     - Large explosion (radius 200, damage 5, blast 5)
     - Lower damage, higher blast radius

  3. **Missile** - Smart munition (completely new)
     - **Homing capability:** 720°/s rotation, 600 m/s velocity
     - **Proximity detonation:** 100m trigger radius
     - **Massive explosion:** radius 1000, damage 50
     - **60-second flight time**
     - Sophisticated guidance system (blog mentioned torpedoes conceptually)

### Explosion System
- **`explosion.ts`** - Blast damage mechanics (new)
  - Properties: `secondsToLive`, `expansionSpeed`, `damageFactor`, `blastFactor`
  - Falloff calculation: `damage = baseDamage × (1 - dist/radius)²`
  - Blast force: Applies impulse to nearby objects
  - Different explosion profiles per projectile type

### Chaingun Enhancements
- **Expanded:** From blog's basic implementation
- **`chain-gun-manager.ts`** - Advanced firing control
  - Rate of fire factor (heat-based modulation)
  - Ammo loading mechanics
  - Fire control integration

## Armor System (Fully Implemented)

**Blog status:** Damage system milestone 2 had basic design, sectional armor concept

**Current implementation:**
- **`armor.ts`** - Complete sectional armor (blog had concept)
  - **Armor plates:** Array of directional plates with individual health
  - **Damage routing:** Hit angle determines which plate takes damage
  - **Breach mechanics:** Plate destruction allows penetration to internal systems
  - **Health tracking:** `healthyPlates` count, `totalHealth` aggregate

- **Fixes:** PRs #1696 (April 2024), #1733 (April 2024)
  - Fixed armor measurement logic
  - Corrected damage calculation formulas
  - Added comprehensive tests

## Navigation & Movement

### Warp Drive
- **`warp.ts`** - FTL travel system (new)
  - Properties: `chargeLevel`, `currentLevel`, `desiredLevel`
  - Charge/discharge mechanics
  - Integration with ship power systems

### Smart Pilot (Autopilot)
- **`smart-pilot.ts`** - Advanced automation (blog had basic autopilot concept)
  - Modes: Manual, angle targeting, position targeting
  - `targetAngle`, `targetPosition` properties
  - Integration with bot AI and player commands

### Maneuvering System
- **`maneuvering.ts`** - Enhanced from blog version
  - Properties: `rotationSpeed`, `afterburnerBoost`
  - Afterburner heat generation (blog mentioned, now fully modeled)
  - Direction-specific thrust capacity

### Thruster Improvements
- **`thruster.ts`** - Evolved from blog's damage implementation
  - Properties: `angle`, `active`, `efficiency` (new)
  - Per-thruster effectiveness calculations
  - Individual thruster management (blog had basic broken/working states)

## Ship Management Architecture

### Damage Manager
- **`damage-manager.ts`** - Comprehensive damage routing (blog had basic concept)
  - Armor penetration calculations
  - System damage propagation
  - Malfunction generation (soft/hard problems from blog design)
  - Hit location determination

### Docking System
- **`docking.ts`** - Ship-to-ship attachment (completely new)
  - Properties: `docked`, `dockedTo`, `dockingRange`
  - `docking-manager.ts` - Attachment logic
  - Enables resupply, repairs, boarding mechanics

### Movement Manager
- **`movement-manager.ts`** - Unified flight control (expanded)
  - Integrates thrusters, autopilot, manual controls
  - Anti-drift mechanics (blog described drift problem/solution)
  - Breaks, afterburner, strafe controls
  - Velocity mode vs Direct mode (blog implementation)

## Targeting & Combat

### Targeting System
- **`targeting.ts`** - Fire control (new)
  - Properties: `targetId`, `shipOnly`, `enemyOnly`, `shortRangeOnly`
  - Automatic target filtering
  - Integration with weapons systems

### Radar Enhancements
- **`radar.ts`** - Enhanced from blog version
  - Properties: `range`, `malfunctionRangeFactor`
  - Malfunction mechanics: Range flicker (blog demonstrated)
  - Radar sharing between ships (blog mentioned as mitigation)

## Pilot Controls (Expanded)

**Blog status:** Basic rotation, boost demonstrated in dogfight

**Current controls:**
- `rotation` [-1,1] - Turn left/right
- `boost` [-1,1] - Forward/reverse thrust
- `strafe` [-1,1] - Lateral movement (new)
- `antiDrift` [0,1] - Velocity opposition (new)
- `breaks` [0,1] - Rapid deceleration (new)
- `afterBurner` [0,1] - Rotation boost with heat (expanded)

**Input system:** Keyboard step-based (0.05 increments) + gamepad axis mapping

## Physics Engine (Enhancements)

### SpaceManager Improvements
- **Raycast:** Fast projectile hit detection (prevents tunneling)
- **Explosion propagation:** Area damage with inverse-square falloff
- **Collision response:** Impulse-based physics with restitution
- **Spatial hashing:** O(n log n) collision detection via `detect-collisions` library

### Projectile Physics
- **Homing missiles:** Rotation capacity, velocity capacity, max speed
- **Proximity detonation:** Auto-trigger at range threshold
- **Time-to-live:** Self-destruct for unguided projectiles
- **Raycast intersection:** Ray-sphere math for high-speed projectiles

## Developer Tools & Architecture

### Decorators (Enhanced)
- **`@gameField`** - Colyseus sync (blog had basic usage)
- **`@tweakable`** - GM/debug UI exposure (new)
- **`@range`** - Value constraints with dynamic bounds (new)
- **`@defectible`** - Malfunction system integration (new)
- **Stacking rules:** Order matters (`@range` → `@tweakable` → `@gameField`)

### Testing Infrastructure
- **E2E tests:** Playwright integration with snapshot testing
- **Test harnesses:** ShipTestHarness, Multi-Client Driver
- **Test factories:** Standardized ship/scenario creation
- **Blog status:** Minimal tests, now comprehensive coverage

### GM Tools
- **Tweak UI:** Real-time property manipulation (expanded from blog's basic panel)
- **Object creation:** Drag-and-drop entity spawning
- **Bot commands:** Right-click order issuing
- **Automation manager:** NPC behavior scripting

## Data Structures & State

### Space Objects
- **Spaceship** - Player/NPC vessels (blog version)
- **Projectile** - Bullets, missiles, shells (expanded)
- **Explosion** - Blast damage volumes (new)
- **Asteroid** - Environmental hazards (blog version)
- **Waypoint** - Navigation markers (new)

### State Synchronization
- **SpaceRoom:** Shared space simulation (60 Hz updates)
- **ShipRoom:** Per-ship state (one room per ship)
- **AdminRoom:** Game lifecycle management
- **JSON Pointer commands:** Dynamic property paths (enhanced)
- **Delta sync:** Colyseus automatic state diffing

## Integration & External Systems

### Node-RED Integration
- **Custom nodes:** Starwards-specific flow nodes
- **API exposure:** Ship control, GM commands
- **Event streaming:** Real-time game state to external systems
- **Blog status:** Not mentioned, completely new

### Scripts API
- **`scripts-api.ts`** - Programmatic game control (new)
- **`automation-manager.ts`** - Bot behavior scripting
- **GM command interface:** External automation support

## Visual & UI

### Widget System (Expanded from Blog)
**Blog:** Modular drag-and-drop panels demonstrated

**Current widgets:**
- **Armor display** - Sectional damage visualization
- **Ammo counter** - Magazine status
- **Tubes status** - Missile launcher readiness
- **Targeting** - Lock-on interface
- **Warp** - FTL charge/engage
- **Docking** - Ship attachment status
- **Tweak** - GM debug panel
- **Radar** - Tactical/strategic views

### Screen System
- **Lobby** - Game selection/join
- **Save/Load** - Game state persistence
- **GM Screen** - Map view with interactive controls
- **Ship screens** - Modular station building (blog version)
- **Utilities** - Input configuration, settings

## Maps & Scenarios

### Map System
- **`maps.ts`** - Scenario definitions (expanded from blog's basic setup)
- **Factory functions:** Programmatic map generation
- **Entity placement:** Ships, asteroids, waypoints
- **Faction setup:** Team configurations

## Technical Debt Addressed

1. **Memory leaks:** Fixed in PR #1680 (March 2024)
   - Proper cleanup of Colyseus subscriptions
   - `.values()` instead of `.toArray()` for MapSchema iteration

2. **Armor damage calculation:** Fixed in PRs #1696, #1733
   - Corrected penetration formulas
   - Fixed plate angle calculation

3. **Test stability:** Multiple fixes (November 2024)
   - Helm-assist test timing
   - Multi-client cleanup timeouts

## Documentation (Since Blog)

**New comprehensive docs:**
- `ARCHITECTURE.md` - System design, data flow
- `SUBSYSTEMS.md` - Ship systems reference
- `PHYSICS.md` - Physics engine details
- `PATTERNS.md` - Code conventions, gotchas
- `TECHNICAL_REFERENCE.md` - Decorators, build tools
- `API_REFERENCE.md` - Commands, events
- `LLM_CONTEXT.md` - AI assistant guide
- `testing/README.md` - Testing guide
- `testing/UTILITIES.md` - Test tools reference
- `INTEGRATION.md` - Node-RED integration

**Blog status:** Minimal documentation, now extensive

## Summary of Major Additions

**Systems not in blog posts:**
1. ✅ Missiles and torpedo tubes
2. ✅ Energy/reactor management
3. ✅ Heat/coolant system
4. ✅ Warp drive
5. ✅ Docking system
6. ✅ Bot AI with orders/strategies
7. ✅ Waypoint navigation
8. ✅ Explosion blast damage
9. ✅ Homing missiles with proximity detonation
10. ✅ Magazine/ammo management
11. ✅ Smart pilot/autopilot
12. ✅ Targeting system
13. ✅ Node-RED integration
14. ✅ Comprehensive armor implementation
15. ✅ System effectiveness formula (full implementation)

**Removed from blog vision:**
1. ❌ 3D rendering (deliberate focus decision)
2. ❌ Corvette class ships (not yet implemented)
3. ❌ Multiple bridges (single-ship focus currently)

**Fully implemented from blog design:**
1. ✅ Sectional armor system
2. ✅ Damage reports and malfunctions
3. ✅ Thruster damage and drift management
4. ✅ Chaingun with airburst (implemented as explosion system)
5. ✅ Dogfight mechanics (complete)
6. ✅ Modular screen building

---

*Last blog post: June 19, 2022 - "Radar Damage"*
*Current analysis: November 7, 2025*
*Repository started fresh: March 4, 2024 (appears to be rewrite/new implementation)*
