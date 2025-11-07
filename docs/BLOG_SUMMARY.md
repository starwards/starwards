# Starwards Blog Post Summary

*Product design context reference from starwards.github.io blog posts (2021-2022)*

## Background: The Epsilon Saga

**The Origin Story** - Starwards emerged from years of experience running space LARP games using EmptyEpsilon (2016-2021). The team heavily extended EmptyEpsilon through JavaScript drivers, server management CLI, OSC gateways, and custom engineering panels, but avoided modifying the C++ core initially.

**The Breaking Point** - Running large-scale LARPs with huge maps exposed EmptyEpsilon's limitations. Features needed for lengthy LARP sessions were rejected after 9 months of review, as EmptyEpsilon was designed for short game sessions. The team forked the project and added:
- Large map support with invisible "space highways" (Navigator station)
- Drone carrier mechanics with tractor beams
- Screen redesigns favoring information over interaction (inspired by Bret Victor)
- Multi-GM support, faction diplomacy, manual AI control
- Password-protected database entries

**The Decision to Start Fresh** - Despite a productive fork, maintaining it became unsustainable. The gap between visions became unbridgeable. The team decided to build Starwards from scratch - a simulator designed specifically for LARP needs with the freedom to execute their full vision.

**Community Impact** - During this period, tdelc created "the primary LARP fork of EmptyEpsilon," incorporating many of the team's features. Daid began EEOne, a ground-up rewrite with modern C++, dynamic screen framework, and 3D movement.

## Design Philosophy

**Hard Sci-Fi Foundation** - Commitment to low/hard sci-fi using practical technology and real physics. Internal coherence and justification are paramount. No energy shields - armor instead. No magic explanations.

**Anti-Abstraction Approach** - Rejection of hit points and damage points. Prefer concrete system states over opaque health metrics. Let players create their own abstractions from technical data (e.g., engineers summarizing "core at eighty percent" while pilots see raw system data). This builds role niches.

**Information Over Interaction** - Screens should display actionable information with minimal interactive elements. Prefer joysticks and keyboards over touchscreens. Drawing from Bret Victor's "Magic Ink" philosophy.

**Lean Development** - Following lean startup methodology: achieve MVP for each milestone, then move forward. Avoid tunnel vision on single features.

**Platform Vision** - Starwards as a platform for LARPs of different sizes. Modular widget-based screen building allows organizers to drag-and-drop components, creating unlimited custom screens accessible by URL. GMs can add widgets in real-time to take over or spy on stations.

## Milestone 1: Dogfight (Feb-Mar 2021)

**The Plateau** - After technical foundations were laid (2D rendering, basic physics, collisions, projectiles), the project stalled. Gap between prototype and usable simulator seemed vast. Many ideas but no clear next step.

**Milestone Selection Criteria:**
1. Primary game mechanic (repeated player activity)
2. Team has good grasp of desired feel
3. Independent of undesigned mechanisms
4. Foundation for other design derivations
5. Packageable as complete testable experience

**The Choice: Dogfight** - Two identical space fighters, single pilot each, trying to hit opponent first. This drives design of steering, maneuvering, engagement ranges, aiming, ballistics - branching later to complex combat, larger ships, 3D view, advanced GM tools.

**The Fighter Dilemma** - Extensive debate on whether fighters make sense in hard sci-fi:

*Arguments For:*
- Iconic spacecraft in sci-fi
- High-paced exciting combat
- Single-seat stations increase player capacity without more bridges
- Easily convert to unmanned drones

*Arguments Against:*
- Human life support requirements (pressure, oxygen, temperature) consume space
- Human limitations (reaction time, G-LOC vulnerability)
- Torpedoes are essentially unmanned fighters without human constraints
- Can be faster, smaller, pull harder maneuvers
- If ships can intercept torpedoes with chainguns, fighters become sitting ducks
- Reference: "The Expanse" analysis - fighters work for orbital defense, not deep-space warfare

*Resolution:* Fun and LARP value take priority over absolute realism. Design combat environment that justifies fighter existence without sacrificing too much realism.

## Weapon Systems: Three Engagement Circles

**Range Concept** - In space, projectiles travel indefinitely. Real limit is weapon effectiveness at different ranges, not physical range.

**Three Circles Framework:**

1. **Close Range** - CIWS-style systems, high rate of fire, projectile velocity over accuracy
2. **Intermediate Range** - Railguns effective in middle ground, too slow for close (charge time), too dodgeable at long range
3. **Long Range** - Self-propelled torpedoes with advanced sensors and guidance

Each weapon belongs to one circle, with exact ranges affected by sensors, firing computers, ship systems. Weapons can function outside their circle but at drastically reduced effectiveness.

**The Chaingun (First Weapon)** - External chain-powered autocannon chosen for first weapon:

*Advantages:*
- Not dependent on cartridge firing for cycling (blowback-free)
- Misfires don't jam weapon - round ejects, new round loads
- Variable motor speed controls rate of fire
- Helps heat management and fume extraction
- EX-34 test: 100,000 rounds, zero jams

*Ammunition: Airburst Rounds* - Programmed to detonate mid-air via fire control computer:
- Anti-personnel: Penetrate hard cover, disperse fragmentation
- Anti-air: Explode near target, increase hit probability with fragmentation
- Perfect for small, fast, maneuverable fighters
- Won't damage large armored ships, but deadly to unarmored fighters

**Implementation** - Orange target icon shows detonation point. Distance adjusts manually or automatically when locked on enemy ship.

**Flight Mechanics Demonstrated:**
- Basic maneuvering and afterburner
- Flight control modes (Velocity vs Direct)
- Space physics (Newtonian)
- Target locking and following
- Airburst sight adjustments
- Deflection sight
- Combat maneuvers

## Milestone 2: Damage System (Mar-May 2021)

**The Pivot** - After dogfight MVP, team chose engineering over weapons expansion. Engineering is core content for almost all ship systems - better to establish foundations early.

**Specific Focus: Damage System** - Defines ship construction, system perception, damage handling philosophy.

**Key Design Decisions:**

**TPK Control** - LARP organizers must control Total Party Kill situations. Game rules shouldn't auto-destroy player ships. Ship destruction is GM decision to prevent premature game ending.

**No Damage Points** - Hit points are opaque abstractions from wargaming history. In real world, no such convenient metrics exist. Let players create abstractions themselves from technical data - this builds role differentiation and player tasks.

**System Malfunctions Over Destruction** - Damage causes malfunctions that limit/handicap ship but don't destroy it:
- **Soft problems:** Increase chances of more malfunctions, don't hinder performance
- **Hard problems:** Directly hinder system performance

**Damage Reports** - Inspired by Thorium. When malfunction occurs, ship computer prompts with:
- Reason for malfunction
- How it affects the system
- Ways to fix or mitigate
- Creates more player task opportunities

**Diagnosis** - Players can diagnose before damage report:
- **Proactive diagnosis:** Predict malfunctions before negative effects (routine tests, alert technicians) - primary method for Soft problems
- **Reactive diagnosis:** Analyze problems faster than ship computer

**Structure Regions (SR)** - Ship divided into regions:
- Fighters: 2 SRs
- Spaceships: 4 SRs
- Each SR hosts multiple systems
- Systems can span multiple SRs (e.g., maneuvering has thrusters on opposite sides)
- Redundancy between SRs provides backups

**Armor System** - Inspired by Battletech, no energy shields:
- Absorbs damage before internal systems
- Different armor types effective against different damage types
- Fully functional armor absorbs 100% of designed damage type
- Malfunctions create breaches
- More breaches = higher chance of damage penetration

*Armor Uniqueness:*
1. Repairs require shipyard docking (major game event potential)
2. Handles damage orders of magnitude better than internal systems

*Damage Resolution Process:*
1. Armor processes damage, may be affected, calculates breach penetration
2. Penetrated damage propagates to internal systems
3. Each system resolves damage according to its logic

### Thruster Damage Implementation

**Refactoring** - Moved from abstract ship movement parameters to discrete thruster objects. Each thruster generates velocity in single direction opposite its angle. Ship movement commands decompose into per-thruster instructions. Thrusters trade energy/fuel for velocity.

**First Malfunction** - Added boolean "is_broken" property (defaults false). Broken thruster can't generate thrust.

**Testing Results** - Starboard thruster disabled:
- Rest/forward/backward: Normal operation
- Left movement: Impossible
- Right movement: Can't stop (nothing pushes left)
- Result: Rightward drift

**Piloting Modes:**
- **Velocity Mode (default):** Helm sets desired velocity, computer adjusts thrusters to match. Helm at rest = ship aims for zero velocity.
- **Direct Mode:** Helm translates directly to thruster commands. Hard to control but engaging. Helm at rest = thrusters idle, ship maintains current velocity.

**Managing Drift** - Naive approach (rotating 90° in Velocity mode) failed: ship velocity rotated with ship, remaining starboard-relative. Thrusters over-corrected, reducing drift only 0.4%/second while changing direction.

*Solution Protocol:*
1. Switch to Direct mode
2. Rotate 90°
3. Switch back to Velocity mode
4. Operational thrusters negate drift in seconds

This gave Direct mode practical purpose and established drift management protocol.

**GM Controls** - Preliminary Tweakpane UI for creating malfunctions. GM selects ship, menu shows components (initially 6 fighter thrusters, expandable to weapons, sensors, navigation, etc.).

**Radar Damage** - When radar damaged, range fluctuates between regular and limited (3,000-1,500). More damage = more time in limited range. Mitigated if nearby ship shares radar data.

## Art Development

### Fighter: Dragonfly SF-22

**Initial Search** - Couldn't find existing 3D models matching requirements:
- Small (1-2 seats), space-only (no wings)
- Heavily armored, chaingun-armed
- Most models were atmospheric hybrids (Viper) or high sci-fi (Starfury)

**Iteration 1** - First concept art helped refine ideas, raised questions:
- Cockpit design, canopy transparency
- Thruster placement affecting flight
- Weapon embedding in hull

**Iteration 2** - First sketch too atmospheric (had wings):
- Liked armored appearance
- Liked omnidirectional thrusters
- Rejected wings for space-only vessel

**Iteration 3** - Wings still present after first revision. Team pivoted:
- Use "wings" as protective plates for thruster shaft
- Sandwich main shaft between metal plates
- Form follows function

Requested:
- Fully armored cockpit (sensors/cameras instead of visibility)
- More angular front (sloped armor like tanks, no need for aerodynamics)

**Iteration 4** - Much closer. Refinements:
- Bottom plate should match top plate size/shape
- Remove all canopy windows, full armor coverage
- Black dots represent gyroscopic thrusters (small nozzles at key locations for rotation/pivoting)

**Final Result: Dragonfly SF-22**
- Named for omnidirectional maneuverability
- "SF" = Space Fighter (treated like jets with codes, not unique ship names)
- Pilots get callsigns, not ships
- ~40 revisions from concept to game-ready 3D model

### Corvette Class Ship

**Next Step** - While milestone 2 progressed, started corvette concept art. Needed larger ships for bridge simulator (multi-station crew operations).

**Choice: Corvette** - Smallest warship class, logical starting point.

**Reference** - The Expanse's Rocinante as excellent realistic corvette example.

**Status** - Initial concepts completed but none hit the mark. Helped clarify requirements for second round.

## Technical Progress

**First 3D View (Jan 2021)** - Basic 3D rendering, minimal logic. Learning orientation (axis direction, yaw/pitch/roll). Initially struggled with ship AI movement during testing - eventually disabled AI for static testing.

**3D Logic Integration (Feb 2021)** - Connected 3D view to game logic (duplicated 2D radar mechanism). Tested rotation interpretation by flying ship in-game while observing 3D viewport.

**Tactical Radar** - Short-range radar, first screen developed. Initially used EmptyEpsilon placeholder blips, planning custom icons later.

**Modular Screen System** - Video demonstration showed drag-and-drop widget system for building custom screens. Unlimited screens, widgets can appear on multiple screens, save/name screens for URL access.

**Main Screen Evolution** - Updated from initial simple menu to polished interface showing:
- Game Master option with nebula backdrop
- Individual ship selection (GVTS, R2D2) with Dragonfly renders
- Station presets (DEFAULT, DEFAULT2, STD)
- Screen options (EMPTY SCREEN, MAIN SCREEN)
- Utilities (INPUT)

**GM Features** - First implementation: zoom in/out, select items, drag-and-drop movement on radar.

## AI and Advanced Features

**Jouster Bot** - First AI: aggressive fighter attack behavior. When two jouster bots fight, they charge at top speed while firing, slow down, turn around, charge again. Required extensive calculations and tedious debugging. Only configurable in code when defining spaceships, not interactive.

**First GM Command: "Go To"** - Simpler than "attack" command:
- Any map location is valid target
- Can position units
- Quick way to disable previous orders
- Doubles as "stand down" or "run away"
- Avoids pathfinding complexity initially (point-to-point blind movement)

*Development Story:* First attempt had ships spiraling into space. Bot removed itself but left thrusters/rotation active. Solution: Add cleanup instructions before bot removal - activate autopilot, order zero rotation and velocity.

## Project Status

**Open Source (June 2022)** - Made project public to recruit community help. Acknowledged signs of closed development:
- Insufficient automated tests
- Missing documentation
- Unclear communication of principles/vision

Team eager to fix issues and make welcoming to newcomers.

**Updated Radar Design** - Experimenting with new radar aesthetics (no preview available at time of post).

## Key Technical Insights

**Flight Physics** - Newtonian mechanics with drift. Thruster damage creates realistic asymmetric movement challenges requiring protocol-based solutions.

**Automation Philosophy** - Two piloting modes serve different purposes:
- Velocity mode: User-friendly, computer-assisted
- Direct mode: Manual, challenging, necessary for damage scenarios

**System Effectiveness Formula** - `power * coolantFactor * (1 - hacked)` - establishes foundation for subsystem interactions.

**Testing Methodology** - Dogfight showcase video demonstrated working implementations: afterburner, lock-on, target following, weapon systems, physics, flight modes.

## Design Principles for Future Development

1. **Justification First** - Every feature must have internal-world reasoning
2. **Concrete Over Abstract** - Real system states over arbitrary points
3. **Role Differentiation** - Same data, different lenses per role
4. **Player Tasks** - Create opportunities for meaningful player activities
5. **Malfunction Over Destruction** - Handicap, don't eliminate
6. **Lean Milestones** - MVP then advance, avoid tunnel vision
7. **Platform Flexibility** - Modular, configurable, adaptable to different LARP scales
8. **Information Density** - Show actionable data, minimize interaction elements

## Visual Design Language

- **Color Scheme:** Cyan/teal primary UI elements, red for warnings/stop
- **Typography:** Futuristic sans-serif, technical readability
- **Space Aesthetic:** Dark backgrounds with stars, nebulae
- **Ship Design:** Angular, armored, functional over aesthetic
- **UI Philosophy:** Clean, minimal, information-forward

## Influences and References

- **The Expanse** - Primary influence for realistic space combat, ship design
- **Battletech** - Armor system, structure regions
- **EmptyEpsilon** - Foundation experience, lessons learned
- **Thorium** - Damage report system
- **Bret Victor** - UI philosophy (Magic Ink)
- **Lean Startup** - Development methodology
- **A-10 Thunderbolt** - Fighter philosophy (armored over agile)

## Community Engagement

Team actively:
- Helped Outbound Hope customize their game
- Assisted Kilted-Klingon with events
- Coordinated with tdelc on features/bug hunting
- Contributed fixes and utilities back to EmptyEpsilon
- Published developer guides and build tools
- Open-sourced with intent to grow community

---

*This summary synthesizes all blog posts from starwards.github.io (2021-01-14 through 2022-06-19) for product design context reference.*
