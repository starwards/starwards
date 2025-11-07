# Starwards Blog Post Series Plan

*Catching up with readers: Changes from June 2022 to November 2025*

## Overview

The blog has been silent since June 2022. This series will bring readers up to date with major developments, organized thematically to tell the story of the project's evolution.

---

## Post 1: "Letting Go of 3D: A Focus Decision"

**Theme:** Strategic focus and productivity

**Changes covered:**
- Removal of 3D rendering (PR #1659, March 2024)
- Deleted: All 3D infrastructure (lights, meshes, particles, skybox, main-screen)
- Why: Focus effort on core 2D gameplay and systems
- Connection to blog history: The 3D experiments shown in early 2021 posts

**Narrative arc:**
- Reflection on the 3D experiments from 2021
- The realization: 3D was consuming resources without adding LARP value
- Hard decision to remove 6 months of work
- What we gained: Velocity on core systems
- Lesson learned: Sometimes progress means deletion

**Key message:** "We chose depth over spectacle"

---

## Post 2: "Engineering Complete: Energy, Heat, and System Effectiveness"

**Theme:** The engineering milestone we promised

**Changes covered:**
- Reactor and energy management system
- Heat and coolant distribution
- System effectiveness formula implementation
- Power allocation when demand exceeds supply
- Coolant factor affecting all systems
- Overheat damage mechanics

**Narrative arc:**
- Callback to Milestone 2 (damage system) from March 2021
- "We promised engineering content - here it is"
- How energy flows through the ship
- The interconnected web: power affects heat affects effectiveness
- Real consequences: brown-outs, overheat shutdowns
- LARP implications: Role differentiation for engineers

**Key message:** "Every system is now a living, breathing part of the ship"

**Technical deep-dive:**
- Formula: `effectiveness = broken ? 0 : power × coolantFactor × (1 - hacked)`
- Energy budget calculations
- Heat accumulation and dissipation math

---

## Post 3: "Missiles, Torpedoes, and Big Explosions"

**Theme:** Long-range engagement circle implementation

**Changes covered:**
- Missile and torpedo tube system
- Magazine and ammunition management
- Three projectile types (CannonShell, BlastCannonShell, Missile)
- Homing missiles with 720°/s rotation capacity
- Proximity detonation mechanics
- Explosion system with blast damage and force
- Inverse-square falloff physics

**Narrative arc:**
- Callback to "Engagement Circles" post (Feb 2021)
- We had chainguns (close range) - now we have missiles (long range)
- The weapon system we dreamed about
- Smart munitions that think
- Proximity fuses and area denial
- LARP impact: Tactical depth, weapons officer role

**Key message:** "The three engagement circles are now complete"

**Technical showcase:**
- Homing algorithm (rotation capacity, velocity capacity, max speed)
- Proximity detonation trigger at 100m
- Explosion propagation with physics
- Comparison table of all three projectile types

---

## Post 4: "Armor Reborn: From Design to Reality"

**Theme:** Implementing the vision

**Changes covered:**
- Full sectional armor implementation
- Directional armor plates with individual health
- Hit angle calculation and damage routing
- Breach mechanics and penetration
- Armor damage fixes (PRs #1696, #1733)
- Visual armor display widget

**Narrative arc:**
- Callback to "Damage System" design post (April 2021)
- We had the design on paper, inspired by Battletech
- From concept to code: The implementation journey
- The bugs we found and fixed (April 2024 fixes)
- How it plays: Angling your ship matters
- LARP impact: Tactical positioning, damage reports

**Key message:** "The damage system we designed three years ago is now real"

**Visual elements:**
- Show armor plate diagrams
- Damage visualization screenshots
- Before/after of armor fixes

---

## Post 5: "Bots, Autopilots, and AI Commanders"

**Theme:** Automation and autonomy

**Changes covered:**
- Bot AI system with orders (MOVE, ATTACK, FOLLOW)
- Idle strategies (PLAY_DEAD, ROAM, STAND_GROUND)
- GM command interface (right-click orders)
- Smart pilot/autopilot system
- Automation manager for scripting
- Integration with movement controls

**Narrative arc:**
- Remember "Working on simple AI commands" (June 2022)?
- From spiral-bug to full AI framework
- Orders system: What GMs wanted
- Idle behaviors: Ships that feel alive
- Autopilot: Helping players focus on tactics
- LARP impact: GMs can run complex scenarios, players get assistance

**Key message:** "Ships can think for themselves now"

**Demonstration:**
- Attack order flowchart
- Formation flying with FOLLOW
- STAND_GROUND ambush tactics

---

## Post 6: "Getting Around: Warp, Waypoints, and Docking"

**Theme:** Navigation and ship operations

**Changes covered:**
- Warp drive system (FTL travel)
- Waypoint navigation markers
- Docking system (ship-to-ship)
- Enhanced movement controls (strafe, antiDrift, breaks)
- Movement manager unification
- Afterburner heat generation

**Narrative arc:**
- From dogfights to strategic movement
- Warp drive: Finally leaving the neighborhood
- Waypoints: Tactical planning and coordination
- Docking: Resupply, repairs, boarding
- The full pilot's toolkit
- LARP impact: Larger maps, complex missions

**Key message:** "The universe just got bigger"

**Feature showcase:**
- Warp charge/engage sequence
- Waypoint-based mission planning
- Docking maneuvers and protocols

---

## Post 7: "Targeting, Fire Control, and Combat Refinements"

**Theme:** Polishing the combat experience

**Changes covered:**
- Targeting system with filters
- Radar enhancements and malfunction mechanics
- Enhanced chaingun with rate-of-fire modulation
- Physics improvements (raycast, spatial hashing)
- Collision response and impulse
- Combat widget improvements

**Narrative arc:**
- Building on the dogfight foundation
- From basic lock-on to sophisticated fire control
- Target filters: shipOnly, enemyOnly, shortRangeOnly
- Radar damage that matters
- Physics that feel right
- LARP impact: Deeper tactical play

**Key message:** "Combat that rewards skill and coordination"

---

## Post 8: "The Developer Experience Revolution"

**Theme:** Making Starwards welcoming to contributors

**Changes covered:**
- Comprehensive documentation (10+ new docs)
- Testing infrastructure (Playwright E2E, test harnesses)
- Enhanced decorators (@tweakable, @range, @defectible)
- GM tools and tweak UI
- Node-RED integration
- Code patterns and conventions

**Narrative arc:**
- Remember "Starwards is now open-source" (June 2022)?
- We said it showed "signs of being a closed project"
- The documentation effort
- Testing: From minimal to comprehensive
- Tools that make development joyful
- Node-RED: External integration possibilities
- LARP impact: Easier for organizers to customize

**Key message:** "We're building a platform, not just a game"

**Developer showcase:**
- Documentation structure overview
- Test harness demo
- Decorator examples
- Node-RED flow example

---

## Post 9: "The Rewrite: Why We Started Fresh"

**Theme:** Technical maturity and architecture evolution

**Changes covered:**
- The decision to rewrite (March 2024 start date)
- Colyseus architecture refinement
- State synchronization improvements
- SpaceRoom + ShipRoom architecture
- JSON Pointer commands
- Performance optimizations (memory leak fixes)

**Narrative arc:**
- Looking at the 2021-2022 codebase
- What we learned from the prototype
- The decision to start fresh
- Carrying forward the good parts
- Lessons from EmptyEpsilon fork experience
- LARP impact: More stable, more scalable

**Key message:** "Sometimes you need to rebuild the foundation"

**Technical reflection:**
- Architecture diagrams (old vs new)
- What stayed, what changed, what improved
- Performance metrics

---

## Post 10: "State of Starwards 2025: What's Next"

**Theme:** Looking forward

**Changes covered:**
- Summary of everything achieved
- Current state of the project
- What's still missing from original vision:
  - Corvette class ships
  - Multiple bridges
  - Advanced damage reports
  - Cyber warfare gameplay
- Community growth
- Roadmap for next year

**Narrative arc:**
- Where we've been (blog summary)
- Where we are (current capabilities)
- Where we're going (roadmap)
- Call to action: Join us
- LARP impact: Production readiness assessment

**Key message:** "Join us in building the simulator we always wanted"

**Community focus:**
- Contribution opportunities
- How to get started
- Discord invite
- Upcoming features vote

---

## Publishing Strategy

**Cadence:** One post every 1-2 weeks (series runs 3-5 months)

**Order rationale:**
1. Start with strategic decision (3D removal) - shows maturity
2. Engineering deep-dive - delivers on old promise
3-6. Feature posts - showcase major additions
7. Combat polish - brings it together
8. Developer experience - welcomes contributors
9. Technical retrospective - shows learning
10. Future vision - inspires participation

**Cross-references:**
- Each post links back to relevant 2021-2022 blog posts
- Each post links to GitHub PRs where applicable
- Final post links to all previous posts in series

**Visuals needed:**
- Screenshots of new features
- Diagrams (energy flow, armor system, AI orders)
- GIFs/videos (missile homing, explosions, docking)
- Code snippets (system effectiveness formula, homing algorithm)

**Tone:**
- Honest about challenges and decisions
- Technical but accessible
- Show the journey, not just the destination
- Celebrate the community and open-source values

---

## Appendix: Post-to-Changes Mapping

### Post 1 (3D Removal)
- PR #1659

### Post 2 (Engineering)
- reactor.ts
- energy-manager.ts
- heat-manager.ts
- system.ts (effectiveness formula)
- coolant distribution

### Post 3 (Missiles)
- tube.ts
- magazine.ts
- projectile.ts (3 types)
- explosion.ts
- Homing mechanics
- Proximity detonation

### Post 4 (Armor)
- armor.ts
- damage-manager.ts
- PRs #1696, #1733
- Sectional plates
- Penetration mechanics

### Post 5 (AI)
- automation-manager.ts
- smart-pilot.ts
- Bot orders/strategies
- PR #1640
- GM commands

### Post 6 (Navigation)
- warp.ts
- waypoint.ts (PR #1753)
- docking.ts + docking-manager.ts
- movement-manager.ts
- Enhanced controls

### Post 7 (Combat)
- targeting.ts
- radar.ts enhancements
- chain-gun-manager.ts
- Physics improvements
- Raycast, spatial hashing

### Post 8 (DX)
- All documentation
- Testing infrastructure
- Decorators
- GM tools
- Node-RED integration

### Post 9 (Rewrite)
- Architecture decisions
- Colyseus patterns
- Memory leak fixes
- State sync improvements

### Post 10 (Future)
- Roadmap
- Missing features
- Community call

---

*This series transforms 3+ years of silent development into a compelling narrative that honors the journey, educates readers, and invites participation.*
