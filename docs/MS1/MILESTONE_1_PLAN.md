# Milestone 1: Mission in the Fringe Features - Implementation Plan

**Generated:** 2025-11-06
**Status:** 35 closed / 27 open issues (57% complete)
**Goal:** Minimum features to run the Helios "Mission in the Fringe" LARP

---

## Executive Summary

This document outlines a 6-phase implementation plan to complete Milestone 1. The plan prioritizes unblocking dependencies and delivering LARP-critical ship stations (Navigator, Signals, Relay) while managing technical debt and complexity.

**Timeline Estimate:** 8-10 weeks total
**Critical Path:** Scan Levels → Signals Jobs → Signals Station

---

## Critical Dependency Analysis

### Blocking Chains Identified

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

4. **Ship Docking → Dock Master**
   - #539 (ship-in-ship docking) blocks #538 (dock master)
   - #538 blocks repair/fighter features (#543, #545, #547, #549)

---

## Phase 1: Foundation & Core Mechanics (9 issues)

**Priority:** HIGH
**Timeline:** 2-3 weeks
**Dependencies:** None - these unblock all other work

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

## Phase 2: Systems & Dependent Widgets (2 issues)

**Priority:** HIGH
**Timeline:** 1 week
**Dependencies:** Requires Phase 1 completion (#1205, #1214)

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

---

## Phase 3: Ship Stations (3 issues) ⭐ LARP CRITICAL

**Priority:** HIGH
**Timeline:** 2 weeks
**Dependencies:** Requires Phases 1 & 2

These are the core player-facing stations needed for LARP gameplay.

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
- **Depends on:** #1209 (radar), #1210 (toggle widget), #1214 (model)
- **State:**
  - Each navigation waypoint set: shown/hidden
  - Course waypoint selection state
- **Widgets:**
  - Dradis radar
  - Navigation waypoint layers toggle
- **Hotkeys:**
  - Toggle each navigation waypoint layer
  - Toggle waypoint creation mode on/off
  - Delete selected waypoint(s)
- **TBD:** Probes functionality
- **Deliverables:**
  - [ ] Create Relay station container
  - [ ] Add waypoint visibility state
  - [ ] Add course waypoint selection state
  - [ ] Integrate #1209 dradis radar
  - [ ] Integrate #1210 toggle widget
  - [ ] Implement hotkey system:
    - [ ] Toggle waypoint layers
    - [ ] Toggle creation mode
    - [ ] Delete waypoints

---

## Phase 4: Advanced Game Features (5 issues)

**Priority:** MEDIUM
**Timeline:** 2-3 weeks
**Dependencies:** Can be done in parallel with Phase 3

### Core Mechanics

**#1182 - Space highways / warp routes**
- **Type:** Enhancement, needs design clarity
- **Risk:** Medium - design work needed
- **Deliverables:** TBD based on design

**#539 - Ship-in-ship docking** ⚠️ COMPLEX
- **Blocks:** #538 (dock master) + 4 repair features
- **Features:**
  - Define which ships can dock in which other ships
  - Docking protocol (pilot-initiated for MVP)
- **Related:** #548 (cargo system)
- **Risk:** High - complex feature with multiple dependencies
- **Deliverables:**
  - [ ] Design docking capability matrix
  - [ ] Implement docking state management
  - [ ] Add docking initiation protocol
  - [ ] Create docking API
  - [ ] Add tests for docking scenarios

**#546 - Multiple ship models**
- **Type:** Enhancement
- **Risk:** Medium - may require asset work
- **Deliverables:**
  - [ ] Design ship model system
  - [ ] Create model definitions
  - [ ] Implement model selection
  - [ ] Add visual assets (if needed)

**#548 - Cargo system**
- **Type:** Enhancement, needs feature design
- **Related:** #539 (ship-in-ship docking)
- **Risk:** Medium - design work needed
- **Deliverables:** TBD based on design

### Visual Assets

**#1188 - Nebula**
- **Type:** Enhancement, help wanted, good first issue
- **Needs:** Graphic assets
- **Deliverables:**
  - [ ] Create/source nebula assets
  - [ ] Implement nebula rendering
  - [ ] Add nebula placement in space

---

## Phase 5: Docking & Repair Features (5 issues)

**Priority:** MEDIUM-LOW
**Timeline:** 2 weeks
**Dependencies:** Requires #539 completion

**#538 - Space station - dock master functionality** ⚠️ BLOCKED
- **Depends on:** #539 (ship-in-ship docking)
- **Features:**
  - Receive, repair, and launch fighters
- **Deliverables:**
  - [ ] Create dock master station
  - [ ] Implement fighter reception
  - [ ] Add repair functionality
  - [ ] Add launch controls

**#547 - Repair station**
- **Type:** New ship station
- **Deliverables:**
  - [ ] Design repair station functionality
  - [ ] Create repair station UI
  - [ ] Implement repair mechanics

**#549 - Collection of damaged ships**
- **Type:** Enhancement, new ship station
- **Deliverables:**
  - [ ] Design collection mechanics
  - [ ] Implement collection station
  - [ ] Add damaged ship tracking

**#543 - Fighters field repair**
- **Type:** Enhancement
- **Deliverables:**
  - [ ] Design field repair mechanics
  - [ ] Implement repair in space
  - [ ] Add repair UI

**#545 - Fighters in-station repair**
- **Type:** Enhancement
- **Deliverables:**
  - [ ] Design in-station repair flow
  - [ ] Implement repair while docked
  - [ ] Add repair progress tracking

---

## Phase 6: Polish & Balance (4 issues)

**Priority:** LOW
**Timeline:** Ongoing or 1 week at end
**Dependencies:** Can be done throughout

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

---

## Recommended Execution Strategy

### Sprint 1: Unblock Everything (2-3 weeks)
**Focus:** Phase 1 - Foundation & Core Mechanics

**Week 1:**
1. #1239 (composition refactor) - Prevent technical debt
2. #1205 (scan levels) - Unblocks 3 issues
3. #1214 (waypoints model) - Unblocks 2 issues

**Week 2:**
4. #1262 (navigator radar)
5. #1204 (long range radar)
6. #1209 (relay radar)

**Week 3:**
7. #1238 (ship room lifecycle)
8. #1233 (broken status widget)
9. #1187 (hull damage)

### Sprint 2: Core Stations (2 weeks)
**Focus:** Phases 2-3 - Systems & LARP-Critical Stations

**Week 4:**
- #1206 (signals jobs system)
- #1210 (waypoints toggle widget)
- Start #1261 (navigator station)

**Week 5:**
- Complete #1261 (navigator station)
- #1208 (signals station)
- #1211 (relay station)

### Sprint 3: Advanced Features (2-3 weeks)
**Focus:** Phase 4 - Advanced Game Features

**Prioritize based on LARP requirements:**
- #1182 (space highways) - If needed for navigation
- #539 (ship-in-ship docking) - If fighters/docking needed
- #546 (multiple ship models) - Nice-to-have
- #548 (cargo system) - If cargo gameplay needed
- #1188 (nebula) - Visual enhancement

### Sprint 4: Docking & Repair (2 weeks)
**Focus:** Phase 5 - Contingent on #539

Only if fighters and docking are critical for LARP:
- #538 (dock master)
- #547, #549, #543, #545 (repair features)

### Ongoing: Polish
**Focus:** Phase 6 - As time permits

Test and balance throughout:
- #788 (QA armor)
- #968 (armor adjustments)
- #551 (AI handicap)

---

## Risk Assessment

### High Risk Issues

**#1239 - Composition refactor**
- **Risk:** May impact many systems across codebase
- **Mitigation:**
  - Thorough testing after refactor
  - Review all `@tweakable` usages
  - Verify SpaceManager integration

**#539 - Ship-in-ship docking**
- **Risk:** Complex feature, blocks 5 other issues
- **Mitigation:**
  - Break into smaller tasks
  - Start with simple pilot-initiated docking
  - Defer complex features to later

**#1205 - Scan levels**
- **Risk:** Blocks multiple features, needs careful design
- **Mitigation:**
  - Design thoroughly before implementation
  - Create clear API contract
  - Test with existing radars first

### Medium Risk Issues

**#548 - Cargo system**
- **Risk:** Needs feature design, unclear scope
- **Mitigation:**
  - Define MVP scope early
  - Consider deferring if not LARP-critical

**#546 - Multiple ship models**
- **Risk:** May require asset creation
- **Mitigation:**
  - Assess asset requirements early
  - Consider using existing assets with variants

**#1182 - Space highways**
- **Risk:** Needs design clarity
- **Mitigation:**
  - Align with navigator radar design
  - Define data structures early

### Low Risk Issues

**UI Widgets (#1262, #1204, #1209, #1210)**
- **Risk:** Low - well-defined, isolated changes
- **Mitigation:** Standard UI testing

**Simple Mechanics (#1187, #1233)**
- **Risk:** Low - straightforward implementations
- **Mitigation:** Unit tests sufficient

---

## Success Metrics

### Phase Completion
- [ ] Phase 1: 9/9 issues closed
- [ ] Phase 2: 2/2 issues closed
- [ ] Phase 3: 3/3 stations operational
- [ ] Phase 4: Features prioritized and implemented
- [ ] Phase 5: Docking system operational (if needed)
- [ ] Phase 6: Balance verified

### LARP Readiness
- [ ] All 3 core stations functional (Navigator, Signals, Relay)
- [ ] Scan levels working across all stations
- [ ] Waypoint system operational
- [ ] Ship room management working
- [ ] No critical bugs in station UIs

### Quality Gates
- [ ] All tests passing
- [ ] No regression in existing features
- [ ] Performance acceptable for LARP environment
- [ ] Documentation updated

---

## Decision Points

### After Sprint 1 (Week 3)
**Evaluate:**
- Is #539 (ship-in-ship docking) critical for LARP?
- Can we defer Phase 5 (repair features)?
- What Phase 4 features are must-haves?

**Action:** Adjust Sprint 3 priorities based on LARP timeline

### After Sprint 2 (Week 5)
**Evaluate:**
- Are core stations working well?
- Any critical bugs to fix first?
- Time remaining vs. features remaining?

**Action:** Finalize Phase 4 scope, potentially defer Phase 5

### Week 8 Checkpoint
**Evaluate:**
- LARP readiness status
- Time for polish vs. new features

**Action:** Focus remaining time on stability and testing

---

## Dependencies on External Work

### Graphic Assets
- #1188 (Nebula) - Needs nebula assets
- #546 (Multiple ship models) - May need ship model assets

### Design Decisions Needed
- #1182 (Space highways) - Navigation design
- #548 (Cargo system) - Feature scope
- #539 (Ship-in-ship docking) - Docking capability matrix

### Feature Design
- #538, #547, #549, #543, #545 - Repair/dock system design

---

## Open Questions for Stakeholders

1. **LARP Timeline:** What is the target date for "Mission in the Fringe"?
2. **Critical Features:** Are fighters/docking/repair critical for the LARP?
3. **Ship Models:** How many ship models are needed? Do assets exist?
4. **Cargo System:** Is cargo gameplay part of the LARP scenario?
5. **Space Highways:** What is the navigation design for highways?
6. **Probes:** Are probes (#1211 TBD) needed for relay station?

---

## Next Steps

### Immediate Actions (This Week)
1. **Review this plan** with team/stakeholders
2. **Answer open questions** to finalize scope
3. **Start Sprint 1** with #1239 (composition refactor)
4. **Set up project tracking** for milestone progress

### Sprint 1 Kickoff
1. Create feature branches for Phase 1 issues
2. Assign issues to developers
3. Schedule daily standups
4. Set up Sprint 1 review for week 3

---

## Reference Links

- **Milestone:** https://github.com/starwards/starwards/milestone/1
- **Issue Tracker:** https://github.com/starwards/starwards/issues
- **Documentation:** `/docs` folder in repository

---

**Document Version:** 1.0
**Last Updated:** 2025-11-06
**Owner:** Development Team
**Review Cycle:** Weekly during sprints
