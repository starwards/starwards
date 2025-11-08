# Milestone 3: Mission in the Fringe Features - Implementation Plan

**Generated:** 2025-11-06
**Status:** 35 closed / 27 open issues (57% complete)
**Goal:** Minimum features to run the Helios "Mission in the Fringe" LARP
**Issues tracking** [Github issues milestone](https://github.com/starwards/starwards/milestone/1)
---

## Executive Summary

This document outlines a 6-phase implementation plan to complete Milestone 3. The plan prioritizes unblocking dependencies and delivering LARP-critical ship stations (Navigator, Signals, Relay) while managing technical debt and complexity.

**LARP Event Timeline:** 6 months from now (stakeholder confirmed)
**Development Timeline:** 20 weeks development + 4 weeks feature freeze
**Critical Path:** Warp Topology → Navigator Station
**Deferred Post-LARP:** Fighters, Cargo system

---

## Critical Dependency Analysis

### Blocking Chains Identified (all mandatory)

1. **Scan Levels → Signals Station**
   - #1205 (scan levels mechanic) blocks #1206 (signals jobs system)
   - #1206 blocks #1208 (signals station)

2. **Waypoints → Relay Station**
   - #1214 (waypoints layers toggle model) blocks #1210 (toggle widget)
   - #1210 blocks #1211 (relay station)
   - #1209 (relay radar widget) also blocks #1211

3. **Radar Widgets → Stations**
   - #1262 (navigator radar) blocks #1261 (navigator station)
   - #1204 (long range radar) blocks #1208 (signals station)
   - #1209 (relay radar) blocks #1211 (relay station)

4. **Warp Topology → Navigator**
   - #1182 (warp frequency topology) blocks #1262 (navigator radar)
   - #1262 blocks #1261 (navigator station)

5. **Probes → Relay Station**
   - NEW: Probe system implementation blocks #1211 (relay station)

6. **Ship Docking → Dock Master**
   - #539 (ship-in-ship docking) blocks #538 (dock master)
   - #538 blocks repair features (#543, #545, #547, #549)

---

## Phase 1: Foundation & Core Mechanics (10 issues)

**Priority:** HIGH
**Timeline:** 3-4 weeks
**Dependencies:** None - these unblock all other work

✅ **DESIGN COMPLETE:**
- #1205 scan levels - See SCAN_LEVELS_DESIGN.md (active scanning, persistent, shared per faction)
- #1206 signals jobs - See SIGNALS_JOBS_DESIGN.md (Scan/Hack/Track, 9-job queue, skill-based)

### Core Refactoring (Critical Path)

**#1239 - Use composition instead of inheritance in ship-state** ⚠️ ARCHITECTURAL
- **Problem:** `ShipState` inherits `Spaceship`, causing field overlap issues
- **Impact:** `@tweakable` annotations override incorrectly, source of truth unclear
- **Risk:** High - may impact many systems
- **Deliverables:**
  - Refactor ShipState to use composition
  - Fix `targetId` and other overlapping fields
  - Update all references across codebase
  - Verify tweakable panel works correctly

**#1238 - Manage ship room lifecycle**
- **Current:** Ship rooms auto-open for each ship
- **Goal:** Explicit API/GUI control for opening/closing ship rooms
- **Deliverables:**
  - [x] Open ship rooms in default map init (2 of 3)
  - [x] Close ship room on ship destroyed
  - [ ] Extract API for opening/closing (set "player ship" state property)
  - [ ] Add GUI in tweak panel (tweakable)

### Critical Game Mechanics (Unblocks Multiple Issues)

**#1205 - Scan levels mechanic** ⭐ HIGHEST PRIORITY
- **Blocks:** #1206, #1208
- **Goal:** Each space object has scan level per faction (managed by SpaceManager)
- **3 Levels:**
  - Lvl0 (UFO): Physics only (distance, heading, relative speed)
  - Lvl1 (Basic): Faction, model
  - Lvl2 (Advanced): Armor status, damage reports, system list
- **Deliverables:**
  - [ ] Add scan level property to space objects (per-faction)
  - [ ] Implement scan level management in SpaceManager
  - [ ] Update all existing player radars to display Lvl0 objects as unknown
  - [ ] Create API for changing scan levels
  - [ ] Add tests for scan level transitions

### Radar Widgets (Unblock Stations)

**#1262 - Navigator radar widget**
- **Blocks:** #1261 (Navigator station)
- **Features:**
  - Display space highways layers
  - Toggle each highway layer on/off
  - Show current ship location
- **Deliverables:**
  - [ ] Create NavigatorRadar widget component
  - [ ] Implement highway layer rendering
  - [ ] Add layer toggle controls
  - [ ] Add ship position indicator

**#1204 - Long range radar widget**
- **Blocks:** #1208 (Signals station)
- **Based on:** Tactical radar
- **Features:**
  - Zoom in/out with level display
  - Highlight station's target
- **Deliverables:**
  - [ ] Clone tactical radar as base
  - [ ] Add zoom controls and display
  - [ ] Implement target highlighting
  - [ ] Add zoom level indicator

**#1209 - Relay radar widget**
- **Blocks:** #1211 (Relay station)
- **Based on:** Dradis radar
- **Depends on:** #1185 (waypoints) ✅ DONE
- **Features:**
  - Display waypoint layer(s) per API
  - Edit course waypoints (select, create, delete)
  - Enter/exit "create waypoint" mode
  - Mouse click to create waypoint
- **Deliverables:**
  - [ ] Clone dradis radar as base
  - [ ] Integrate waypoint layer display
  - [ ] Add waypoint selection mode
  - [ ] Add waypoint creation mode (cursor display)
  - [ ] Implement mouse click handler for waypoint creation

### Warp Frequency Topology (Unblocks Navigator) ⭐ MANDATORY

**#1182 - Space highways / warp routes**
- **Blocks:** #1262 (navigator radar), #1261 (navigator station)
- **Type:** Warp frequency topology system (design complete - see WARP_FREQUENCY_TOPOLOGY_DESIGN.md)
- **Features:**
  - 10 unique frequencies (Alpha-Kappa) with procedural efficiency terrain
  - Gradient-following route optimization with frequency switching
  - Grid-based efficiency sampling for visualization
- **Deliverables:**
  - [ ] Implement procedural noise generation for 10 frequencies
  - [ ] Create efficiency calculation system (0.1x to 2.0x speed)
  - [ ] Build gradient-following route optimizer
  - [ ] Add frequency switching with 5-second penalty
  - [ ] Create grid-based sampling API for visualization
  - [ ] Add warp efficiency modifier to ship movement
  - [ ] Performance: Support 10,000 unit radius at 10 Hz

### Simple UI Enhancements

**#1233 - Add broken status to damage report widget**
- **Context:** Following #1232, widget shows defects but not offline status
- **Deliverables:**
  - [ ] Add "broken" attribute display to damage report widget
  - [ ] Update widget to show system offline state

**#1187 - Hull damage mechanic**
- **Goal:** 2-state mode (ok/hull damaged) for ship
- **Control:** Manually by GM in tweak panel
- **Effect:** No game logic impact - for alerts/lights (IoT control)
- **Deliverables:**
  - [ ] Add hull damage state property to ShipState
  - [ ] Add manual control in tweak panel
  - [ ] Add API for external systems

### State Management

**#1214 - Waypoints layers toggle model**
- **Blocks:** #1210, #1211
- **Depends on:** #1185 (waypoints) ✅ DONE
- **Goal:** Client-side store to track which waypoint layer is displayed
- **Deliverables:**
  - [ ] Create client-side store for waypoint layer visibility
  - [ ] Implement toggle state management
  - [ ] Add API for layer control

---

## Phase 2: Systems & Dependent Widgets (3 issues)

**Priority:** HIGH
**Timeline:** 1-2 weeks
**Dependencies:** Requires Phase 1 completion (#1205, #1214, #1182)

**#1206 - Signals jobs system**
- **Depends on:** #1205 (scan levels)
- **Blocks:** #1208 (signals station)
- **Features:**
  - Collection of jobs per ship (target + action)
  - Auto-complete jobs in creation order, one at a time
  - Malfunction effects: increased fail chance, slower execution, reduced max jobs
  - Hacking only possible for scan level 2 targets
- **Deliverables:**
  - [ ] Add job collection to ShipState
  - [ ] Implement job execution system
  - [ ] Add malfunction impact calculations
  - [ ] Integrate scan level 2 requirement for hacking
  - [ ] Add tests for job queue behavior

**#1210 - Waypoints layers toggle widget**
- **Depends on:** #1214 (waypoints model)
- **Blocks:** #1211 (relay station)
- **Features:**
  - Display navigation waypoint layers
  - Clickable controls for relay radar widget
- **Deliverables:**
  - [ ] Create toggle widget component
  - [ ] Integrate with waypoint model from #1214
  - [ ] Add click handlers for layer control

**NEW - Probe system** ⭐ MANDATORY
- **Blocks:** #1211 (relay station)
- **Type:** Small mobile radars extending relay vision
- **Features (from DESIGN_ANSWERS.md):**
  - Launch probes into space from relay station
  - Probes consume fuel/resources
  - Probes provide radar coverage at their location
  - Essential for relay station to see beyond main radar range
- **Deliverables:**
  - [ ] Design probe object type extending SpaceObjectBase
  - [ ] Implement probe launch mechanics (direction, velocity)
  - [ ] Add fuel/resource consumption system
  - [ ] Create probe radar coverage calculation
  - [ ] Integrate probe radar data into relay station display
  - [ ] Add probe lifespan/destruction mechanics
  - [ ] Create probe launch UI controls for relay station

---

## Phase 3: Ship Stations & Mandatory Systems (5 issues) ⭐ LARP CRITICAL

**Priority:** HIGH
**Timeline:** 3-4 weeks
**Dependencies:** Requires Phases 1 & 2

These are the core player-facing stations and mandatory game systems needed for LARP gameplay.

**#1261 - Navigator station**
- **Depends on:** #1262 (radar widget)
- **Features:**
  - Radar widget for navigation
  - Toggle highway layer display (hotkey per layer)
  - Select navigation waypoint layer to edit
  - Toggle waypoint creation/selection mode
  - Delete selected waypoint(s)
- **Deliverables:**
  - [ ] Create Navigator station container
  - [ ] Integrate #1262 radar widget
  - [ ] Implement hotkey system for:
    - [ ] Toggle each highway layer
    - [ ] Select waypoint layer
    - [ ] Toggle creation/selection mode
    - [ ] Delete waypoint(s)

**#1208 - Signals station**
- **Depends on:** #1204 (radar), #1205 (scan levels), #1206 (jobs system)
- **State:** Has signals target state (client-only)
- **Widgets:**
  - Long range radar
  - Target info (by scan level):
    - Lvl0: Physics (distance, heading, rel.speed)
    - Lvl1: Faction, model
    - Lvl2: Armor status, damage reports, system list
  - List of all signals jobs
- **Hotkeys:**
  - Zoom in/out
  - Next/prev target
  - Toggle filters: unknown only, enemy only
- **Deliverables:**
  - [ ] Create Signals station container
  - [ ] Add client-side target state
  - [ ] Integrate #1204 long range radar
  - [ ] Create target info widget (3 scan levels)
  - [ ] Create jobs list widget
  - [ ] Implement hotkey system:
    - [ ] Zoom controls
    - [ ] Target navigation
    - [ ] Filter toggles

**#1211 - Relay station**
- **Depends on:** #1209 (radar), #1210 (toggle widget), #1214 (model), NEW (probe system)
- **State:**
  - Each navigation waypoint set: shown/hidden
  - Course waypoint selection state
- **Widgets:**
  - Dradis radar (with probe radar coverage)
  - Navigation waypoint layers toggle
  - Probe launch controls ⭐ MANDATORY
- **Hotkeys:**
  - Toggle each navigation waypoint layer
  - Toggle waypoint creation mode on/off
  - Delete selected waypoint(s)
  - Launch probe
- **Deliverables:**
  - [ ] Create Relay station container
  - [ ] Add waypoint visibility state
  - [ ] Add course waypoint selection state
  - [ ] Integrate #1209 dradis radar with probe coverage
  - [ ] Integrate #1210 toggle widget
  - [ ] Add probe launch controls (direction, velocity)
  - [ ] Display active probes on radar
  - [ ] Implement hotkey system:
    - [ ] Toggle waypoint layers
    - [ ] Toggle creation mode
    - [ ] Delete waypoints
    - [ ] Launch probe

### Mandatory Game Systems

**#539 - Ship-in-ship docking** ⭐ MANDATORY
- **Blocks:** #538 (dock master) + repair features
- **Priority:** CRITICAL - Space stations are ships, docking must work
- **Features:**
  - Define which ships can dock in which other ships
  - Docking protocol (pilot-initiated for MVP)
- **Deliverables:**
  - [ ] Design docking capability matrix (from DESIGN_ANSWERS.md ship specs)
  - [ ] Implement docking state management
  - [ ] Add docking initiation protocol
  - [ ] Create docking API for ship-to-ship
  - [ ] Add tests for docking scenarios
  - [ ] Support station docking (critical for LARP)

**#546 - Multiple ship models** ⭐ MANDATORY
- **Priority:** CRITICAL - Need 6-8 ship types with full specs
- **Ship Types (from DESIGN_ANSWERS.md):**
  - Scout, Corvette, Frigate, Destroyer, Cruiser, Carrier, Station, Merchant
- **Deliverables:**
  - [ ] Implement ship model system architecture
  - [ ] Create 8 ship model definitions with:
    - [ ] System configuration (which systems, default power levels)
    - [ ] Layout specifications (station positions)
    - [ ] Performance specs (speed, turning, armor, power)
    - [ ] Text descriptions for players
  - [ ] Add model selection API
  - [ ] Use 2D sprites (3D models not required)
  - [ ] Add model-specific behavior (if needed)

---

## Phase 4: Repair & IoT Integration (4 issues) ⭐ MANDATORY

**Priority:** HIGH
**Timeline:** 2-3 weeks
**Dependencies:** Requires #539 (docking) from Phase 3

**#538 - Space station - dock master functionality**
- **Depends on:** #539 (ship-in-ship docking) from Phase 3
- **Priority:** MANDATORY - Core station management
- **Features:**
  - Receive, repair, and launch docked ships
  - Manage multiple docked ships simultaneously
- **Deliverables:**
  - [ ] Create dock master station UI
  - [ ] Display list of docked ships
  - [ ] Implement repair queue management
  - [ ] Add launch controls
  - [ ] Show repair progress per ship

**#547 - Repair station** ⭐ MANDATORY
- **Type:** New ship station with IoT integration
- **MVP:** GM panel controls until Node-RED ready
- **Features (from DESIGN_ANSWERS.md):**
  - Tier 1: Quick fixes (armor patches, system restarts)
  - Tier 2: Component replacement (damaged subsystems)
  - Tier 3: Major overhaul (structure damage, critical systems)
- **Deliverables:**
  - [ ] Design repair station functionality (3 tiers)
  - [ ] Create repair station UI
  - [ ] Implement repair mechanics and timing
  - [ ] Add GM panel repair controls (MVP)
  - [ ] Prepare IoT integration points for Node-RED
  - [ ] Add repair progress tracking

**#549 - Collection of damaged ships**
- **Type:** Enhancement, new ship station
- **Priority:** MANDATORY for station gameplay
- **Deliverables:**
  - [ ] Design collection mechanics
  - [ ] Implement collection station UI
  - [ ] Add damaged ship tracking
  - [ ] Integrate with dock master (#538)

**#543 - Ship-to-ship field repair**
- **Type:** Enhancement
- **Priority:** MEDIUM - Nice to have
- **Deliverables:**
  - [ ] Design field repair mechanics
  - [ ] Implement repair in space (ship-to-ship)
  - [ ] Add repair UI for field repairs

---

## Phase 5: Polish & Balance (5 issues)

**Priority:** MEDIUM
**Timeline:** 2-3 weeks
**Dependencies:** After core features complete

**#788 - QA armor behavior (now with armor widget)**
- **Type:** Quality
- **Assigned:** amir-arad
- **Deliverables:**
  - [ ] Test armor widget behavior
  - [ ] Verify armor calculations
  - [ ] Fix any issues found

**#968 - Armor adjustments**
- **Type:** Enhancement, help wanted, core game logic
- **Deliverables:**
  - [ ] Review armor balance
  - [ ] Adjust armor values/formulas
  - [ ] Test adjustments

**#551 - AI Handicap variables**
- **Type:** Enhancement, help wanted, core game logic
- **Deliverables:**
  - [ ] Define handicap variables
  - [ ] Implement variable controls
  - [ ] Add to tweak panel

**#1188 - Nebula**
- **Type:** Visual enhancement, help wanted, good first issue
- **Needs:** Graphic assets
- **Priority:** NICE TO HAVE
- **Deliverables:**
  - [ ] Create/source nebula assets
  - [ ] Implement nebula rendering
  - [ ] Add nebula placement in space

---

## Phase 6: Feature Freeze & Pre-Event Prep (4 weeks)

**Priority:** CRITICAL
**Timeline:** 4 weeks before LARP event
**Dependencies:** All features complete

**Activities:**
- [ ] Full LARP scenario testing
- [ ] Player training sessions
- [ ] Bug fixes ONLY (no new features)
- [ ] Performance optimization
- [ ] Multi-ship stress testing
- [ ] Documentation finalization
- [ ] Rehearsals with full crew

---

## Deferred Post-LARP

**Stakeholder Decision:** These features are NOT critical for the LARP event and will be implemented after if needed.

**#548 - Cargo system**
- **Status:** DEFERRED
- **Reason:** Not needed for LARP scenario
- **Related:** #539 (ship-in-ship docking)

**Fighters mechanics (multiple issues)**
- **Status:** DEFERRED
- **Reason:** Not critical for LARP, stations take priority
- **Related issues:** Fighter-specific gameplay features

**#545 - Fighters in-station repair**
- **Status:** DEFERRED
- **Reason:** Part of fighters mechanics, not needed

---

## Recommended Execution Strategy

### Weeks 1-4: Phase 1 - Foundation & Core Mechanics
**Focus:** Unblock all downstream work

**Weeks 1-2: Critical Systems**
1. #1239 (composition refactor) - Architectural fix
2. #1205 (scan levels) ⚠️ Complete design first
3. #1182 (warp frequency topology) - Navigator blocker
4. #1206 (signals jobs) ⚠️ Complete design first

**Weeks 3-4: Radar & UI**
5. #1262 (navigator radar with frequency overlay)
6. #1204 (long range radar)
7. #1209 (relay radar)
8. #1214 (waypoints model)
9. #1238, #1233, #1187 (simple fixes)

### Weeks 5-7: Phase 2 - Systems & Dependent Widgets
**Focus:** Complete dependencies for stations

**Week 5-6:**
- #1210 (waypoints toggle widget)
- NEW: Probe system implementation

**Week 7:**
- Integration testing for all Phase 1-2 components

### Weeks 8-11: Phase 3 - Stations & Mandatory Systems
**Focus:** LARP-critical features

**Weeks 8-9: Ship Stations**
- #1261 (navigator station)
- #1208 (signals station)
- #1211 (relay station with probes)

**Weeks 10-11: Mandatory Game Systems**
- #539 (ship-in-ship docking) ⭐ CRITICAL
- #546 (8 ship models with full specs) ⭐ CRITICAL

### Weeks 12-15: Phase 4 - Repair & IoT Integration
**Focus:** Station repair mechanics

**Weeks 12-13:**
- #538 (dock master)
- #547 (repair station with 3 tiers)

**Weeks 14-15:**
- #549 (damaged ship collection)
- #543 (field repair - if time permits)
- IoT integration testing with Node-RED

### Weeks 16-19: Phase 5 - Polish & Balance
**Focus:** Stability and performance

**Activities:**
- #788 (QA armor behavior)
- #968 (armor adjustments)
- #551 (AI handicap variables)
- #1188 (nebula visual) - if time permits
- Performance optimization
- Multi-ship stress testing

### Weeks 20-24: Phase 6 - Feature Freeze
**Focus:** LARP readiness

**Week 20: FEATURE FREEZE**
- Bug fixes ONLY
- Full LARP scenario testing
- Player training sessions
- Documentation updates

**Weeks 21-24:**
- Weekly rehearsals with full crew
- Bug fixes based on rehearsal feedback
- Final performance tuning
- Backup/rollback procedures

---

## Risk Assessment

### High Risk Issues

**#1239 - Composition refactor**
- **Risk:** May impact many systems across codebase
- **Mitigation:**
  - Thorough testing after refactor
  - Review all `@tweakable` usages
  - Verify SpaceManager integration

**#539 - Ship-in-ship docking** ⭐ MANDATORY
- **Risk:** Complex feature, blocks repair features
- **Impact:** CRITICAL - Space stations need this
- **Mitigation:**
  - Break into smaller tasks
  - Start with simple pilot-initiated docking
  - Use design specs from DESIGN_ANSWERS.md
  - Test with station docking first

**#1205 - Scan levels** ✅ DESIGN COMPLETE
- **Risk:** Medium - Well-defined, needs careful implementation
- **Impact:** HIGH - Blocks signals station
- **Design:** SCAN_LEVELS_DESIGN.md (active scanning, persistent, faction-shared)
- **Mitigation:**
  - Follow design spec closely
  - Create clear API contract
  - Test with existing radars before station integration
  - Effort: 13-18 hours

**#1206 - Signals jobs** ✅ DESIGN COMPLETE
- **Risk:** Medium - Well-defined, needs careful implementation
- **Impact:** HIGH - Blocks signals station
- **Design:** SIGNALS_JOBS_DESIGN.md (Scan/Hack/Track, 9-job queue, skill-based)
- **Mitigation:**
  - Follow design spec closely (6 implementation phases)
  - Start with data model, then execution, then effects
  - Test each job type independently
  - Effort: 21-27 hours

### Medium Risk Issues

**#1182 - Warp frequency topology** ⭐ MANDATORY
- **Risk:** Complex system, blocks Navigator
- **Impact:** CRITICAL - Design complete but implementation complex
- **Mitigation:**
  - Follow WARP_FREQUENCY_TOPOLOGY_IMPLEMENTATION.md closely
  - Start with procedural generation core
  - Test performance early (10,000 unit radius target)
  - Use mock data for navigator radar initially

**#546 - Multiple ship models** ⭐ MANDATORY
- **Risk:** 8 ship types with full specs required
- **Impact:** CRITICAL - LARP needs variety
- **Mitigation:**
  - Use ship specs from DESIGN_ANSWERS.md
  - 2D sprites only (no 3D models needed)
  - Implement system one ship type at a time

**NEW - Probe system** ⭐ MANDATORY
- **Risk:** New feature, relay station blocker
- **Impact:** CRITICAL - Relay needs probes
- **Mitigation:**
  - Extend existing SpaceObjectBase pattern
  - Start with simple launch mechanics
  - Add radar integration last

**#547 - Repair station** ⭐ MANDATORY
- **Risk:** IoT integration complexity
- **Impact:** HIGH - MVP via GM panel acceptable
- **Mitigation:**
  - Implement 3-tier system from DESIGN_ANSWERS.md
  - GM panel controls for MVP
  - Prepare Node-RED integration points for later

### Low Risk Issues

**UI Widgets (#1262, #1204, #1209, #1210)**
- **Risk:** Low - well-defined, isolated changes
- **Mitigation:** Standard UI testing

**Simple Mechanics (#1187, #1233, #1238)**
- **Risk:** Low - straightforward implementations
- **Mitigation:** Unit tests sufficient

**Polish (#788, #968, #551, #1188)**
- **Risk:** Low - can be adjusted iteratively
- **Mitigation:** Ongoing testing and balance

---

## Success Metrics

### Phase Completion
- [ ] Phase 1: 10/10 issues closed (includes #1182 warp topology)
- [ ] Phase 2: 3/3 issues closed (includes NEW probe system)
- [ ] Phase 3: 5/5 issues closed (3 stations + docking + ship models)
- [ ] Phase 4: 4/4 repair features operational
- [ ] Phase 5: Balance verified and polish complete
- [ ] Phase 6: LARP event successful

### LARP Readiness (Week 20 Checkpoint)
- [ ] All 3 core stations functional (Navigator, Signals, Relay)
- [ ] Warp frequency topology working with Navigator
- [ ] Probe system working with Relay
- [ ] Scan levels working across all stations
- [ ] 8 ship models with full specs available
- [ ] Docking system operational (ships can dock at stations)
- [ ] Repair system operational (3 tiers functional)
- [ ] Waypoint system operational
- [ ] Ship room management working
- [ ] No critical bugs in station UIs
- [ ] Performance: 20+ ships at 10 Hz update rate

### Quality Gates
- [ ] All tests passing
- [ ] No regression in existing features
- [ ] Performance acceptable for LARP environment (20+ ships)
- [ ] Documentation updated
- [ ] Player training materials ready
- [ ] Backup/rollback procedures tested

---

## Decision Points

### Week 4 Checkpoint (End of Phase 1)
**Evaluate:**
- ✅ Design gaps closed (#1205, #1206 designs complete)
- Is warp topology performance acceptable? (10,000 unit radius)
- Are foundation systems stable?
- Are #1205 and #1206 implementations complete and tested?

**Action:**
- DO NOT proceed to Phase 2 if implementations incomplete
- Fix performance issues before building on top
- Adjust Phase 2 timeline if needed

### Week 7 Checkpoint (End of Phase 2)
**Evaluate:**
- Is probe system working with relay radar?
- Are all station dependencies ready?
- Integration test results?

**Action:**
- Ensure all blockers cleared for Phase 3
- Fix integration issues before station work begins
- Consider parallel work if some blockers remain

### Week 11 Checkpoint (End of Phase 3)
**Evaluate:**
- Are all 3 stations functional?
- Is docking working for stations?
- Are 8 ship models complete with specs?
- Critical bugs found?

**Action:**
- DO NOT proceed if stations broken
- Week 12 buffer for critical fixes if needed
- Confirm Phase 4 scope based on remaining time

### Week 15 Checkpoint (End of Phase 4)
**Evaluate:**
- Repair system functional?
- IoT integration points ready?
- Time remaining vs. polish needs?

**Action:**
- Decide Phase 5 scope (what polish is critical?)
- Consider early feature freeze if stable

### Week 20 Checkpoint (Feature Freeze Decision)
**Evaluate:**
- All mandatory features complete?
- Critical bugs remaining?
- LARP scenario testable?

**Action:**
- FREEZE features (bugs only)
- OR extend development 1-2 weeks if critical gaps
- Begin weekly rehearsals

---

## Dependencies on External Work

### Design Completion Required (BLOCKERS)
⚠️ **URGENT - Must complete before implementation:**
- **#1205 (Scan levels)** - Need scan progression rules:
  - How do scan levels change? (proximity-based, active scanning, time decay?)
  - What triggers level upgrades/downgrades?
  - What are the exact ranges/thresholds?
- **#1206 (Signals jobs)** - Need job action specifications:
  - What are the specific job types? (scan, hack, jam, track, intercept?)
  - What are success/failure criteria for each?
  - What are the timing/duration values?
  - Reference: Job actions table exists in DESIGN_ANSWERS.md

### Graphic Assets (Nice to Have)
- #1188 (Nebula) - Optional visual enhancement
- #546 (Ship models) - 2D sprites sufficient (no 3D required)

### IoT Integration (Later Phase)
- #547 (Repair station) - Node-RED integration points
  - MVP: GM panel controls
  - Later: Full IoT integration for physical props

---

## Stakeholder Decisions Made ✅

**These questions have been answered - documented here for reference:**

1. **LARP Timeline:** ✅ 6 months from now (stakeholder confirmed)
2. **Critical Features:** ✅ Docking/Repair MANDATORY, Fighters DEFERRED
3. **Ship Models:** ✅ 6-8 ship types needed (Scout, Corvette, Frigate, Destroyer, Cruiser, Carrier, Station, Merchant)
4. **Cargo System:** ✅ DEFERRED post-LARP
5. **Space Highways:** ✅ Warp frequency topology design complete (see WARP_FREQUENCY_TOPOLOGY_DESIGN.md)
6. **Probes:** ✅ MANDATORY for relay station (see DESIGN_ANSWERS.md)

---

## Outstanding Design Questions

✅ **ALL RESOLVED** - See design documents:

**#1205 (Scan Levels):** ✅ Complete
- Design: `docs/MS3/SCAN_LEVELS_DESIGN.md`
- Active scanning via Signals jobs (not proximity)
- Persistent (no decay)
- Shared per faction

**#1206 (Signals Jobs):** ✅ Complete
- Design: `docs/MS3/SIGNALS_JOBS_DESIGN.md`
- 3 job types: Scan, Hack, Track
- Medium duration (15-60s), skill-based success (70-90%)
- Hack: 50% system effectiveness reduction for 2-3 min

**#1182 (Warp Topology):** ✅ Complete
- Design: `docs/MS3/WARP_FREQUENCY_TOPOLOGY_DESIGN.md`
- Implementation: `docs/MS3/WARP_FREQUENCY_TOPOLOGY_IMPLEMENTATION.md`

**Probes:** ✅ Requirements defined
- Details: `docs/MS3/DESIGN_ANSWERS.md`
- Launch mechanics, fuel consumption, radar coverage

**Ship Models, Docking, Repair:** ✅ Requirements defined
- Details: `docs/MS3/DESIGN_ANSWERS.md`
- 8 ship types, docking matrix, 3-tier repair system

---

## Next Steps

### URGENT - Before Starting Phase 1 (Week 0)
✅ **Design gaps resolved!** Ready to proceed:
1. ✅ Scan levels design complete - See SCAN_LEVELS_DESIGN.md
2. ✅ Signals jobs design complete - See SIGNALS_JOBS_DESIGN.md
3. **TODO: Create GitHub issue for probe system** - Document requirements from DESIGN_ANSWERS.md
4. **TODO: Review updated plan** with stakeholders - Confirm 6-month timeline and priorities

### Week 1 Kickoff (Phase 1 Start)
**Only proceed once design gaps are closed!**
1. Start #1239 (composition refactor) - architectural foundation
2. Begin #1182 (warp topology) - critical path for Navigator
3. Create feature branches for Phase 1 work
4. Set up weekly checkpoint meetings (Weeks 4, 7, 11, 15, 20)

---

## Reference Links

- **Milestone:** https://github.com/starwards/starwards/milestone/1
- **Issue Tracker:** https://github.com/starwards/starwards/issues
- **Documentation:** `/docs` folder in repository

---

**Document Version:** 2.0
**Last Updated:** 2025-11-08
**Owner:** Development Team
**Review Cycle:** Weekly at checkpoints (Weeks 4, 7, 11, 15, 20)
**Major Changes v2.0:**
- Aligned with stakeholder decisions from DESIGN_ANSWERS.md
- Moved #1182 (warp topology) to Phase 1 (MANDATORY, blocks Navigator)
- Moved #539 (docking) to Phase 3 (MANDATORY for stations)
- Moved #546 (ship models) to Phase 3 (MANDATORY, 8 types needed)
- Added NEW probe system to Phase 2 (MANDATORY for relay)
- Elevated Phase 4 (repair) priority to HIGH (MANDATORY)
- Updated timeline: 24 weeks (20 dev + 4 freeze) for 6-month LARP
- Deferred fighters and cargo post-LARP
- Flagged design gaps in #1205 and #1206 as blockers
