# Milestone 1: Pre-Engineering Work Analysis

**Generated:** 2025-11-06
**Purpose:** Identify issues requiring design/planning work before engineering can begin

---

## Summary

**Total Issues in Milestone 1:** 27 open
**Issues Ready for Engineering:** 13 (48%)
**Issues Needing Pre-Engineering:** 14 (52%)

### Breakdown by Work Type
- **Product Design Needed:** 7 issues
- **UX/UI Design Needed:** 6 issues
- **Technical Architecture Design:** 3 issues
- **Asset Creation Needed:** 2 issues
- **Stakeholder Decisions Needed:** 6 issues

---

## Issues Ready for Engineering (Can Start Immediately)

### Phase 1 - Ready Now (6 issues)

**#1239 - Composition refactor** ✅
- Well-defined technical problem
- Clear deliverables
- No design work needed

**#1238 - Ship room lifecycle** ✅
- Partially complete, clear remaining work
- API design is straightforward

**#1233 - Broken status widget** ✅
- Simple enhancement to existing widget
- Clear requirements

**#1187 - Hull damage mechanic** ✅
- Simple 2-state flag
- No game logic impact
- Clear scope

**#1214 - Waypoints layers toggle model** ✅
- Client-side state management
- Depends on #1185 (already done)

**#1204 - Long range radar widget** ✅
- Clone existing tactical radar
- Add zoom + target highlighting
- Clear requirements

### Phase 2 - Ready After Dependencies (1 issue)

**#1210 - Waypoints layers toggle widget** ✅
- Depends on #1214 completion
- Clear requirements once model is done

### Phase 6 - Ready Now (3 issues)

**#788 - QA armor behavior** ✅
- Testing/QA task
- No design needed

**#968 - Armor adjustments** ✅
- Balance tuning
- Can be done iteratively

**#551 - AI Handicap variables** ✅
- Add tuning variables
- Straightforward implementation

---

## Issues Requiring Pre-Engineering Work

### CRITICAL PATH - Pre-Engineering Needed (3 issues)

These block multiple features and need design work ASAP:

#### **#1205 - Scan levels mechanic** 🔴 URGENT
**Status:** Partially defined, needs UX/technical design
**Blocks:** #1206, #1208 (Signals station)
**Priority:** HIGHEST

**What's Defined:**
- 3 scan levels (Lvl0/Lvl1/Lvl2)
- Per-faction tracking
- What info is revealed at each level

**Needs Design:**
1. **Technical Architecture:**
   - Data structure for per-faction scan levels
   - How SpaceManager tracks/updates scan levels
   - API contract for changing scan levels
   - Performance implications (many objects × many factions)

2. **Game Design:**
   - How do scan levels change? (proximity? active scanning? time?)
   - Can levels decrease (lose knowledge)?
   - Is there a scanning action/system?
   - Does scanning consume resources?

3. **UX Design:**
   - How do radars display unknown (Lvl0) objects?
   - Visual distinction between scan levels
   - Player feedback when scan level changes

**Deliverables Before Engineering:**
- [ ] Technical design doc: data structures & API
- [ ] Game design doc: scan level progression rules
- [ ] UX mockup: radar display of different scan levels
- [ ] Performance analysis: object count × faction count

**Estimated Pre-Engineering Time:** 2-3 days

---

#### **#1206 - Signals jobs system** 🔴 URGENT
**Status:** Outline exists, needs detailed design
**Blocks:** #1208 (Signals station)
**Depends on:** #1205 (scan levels)
**Priority:** HIGH

**What's Defined:**
- Job queue concept (target + action)
- Auto-completion, one at a time
- Malfunction effects
- Hacking requires scan level 2

**Needs Design:**
1. **Product Design:**
   - What actions are available? (scan, hack, ??? )
   - How long does each job take?
   - What determines success/failure?
   - Can jobs be cancelled?
   - Max queue size?

2. **Game Design:**
   - Resource costs for jobs?
   - Cooldowns between jobs?
   - Can other ships detect your actions?
   - Countermeasures?

3. **Technical Architecture:**
   - Job state machine design
   - Server-side execution vs client prediction
   - How to expose job progress to UI

4. **UX Design:**
   - Jobs list widget layout
   - Job creation UI
   - Progress indicators
   - Success/failure feedback

**Deliverables Before Engineering:**
- [ ] Product spec: available actions & mechanics
- [ ] Technical design: job execution architecture
- [ ] UX mockup: jobs list widget
- [ ] Game balance: timings & malfunction effects

**Estimated Pre-Engineering Time:** 3-5 days

---

#### **#1262 - Navigator radar widget** 🟡 MODERATE
**Status:** Concept clear, needs visual design
**Blocks:** #1261 (Navigator station)
**Depends on:** #1182 (space highways) - unclear if blocking
**Priority:** HIGH

**What's Defined:**
- Display space highways layers
- Toggle layers on/off
- Show ship location

**Needs Design:**
1. **UX/Visual Design:**
   - How do highways appear visually?
   - Color coding for different highway layers?
   - How to show toggles (buttons? checkboxes? overlay?)
   - Ship position indicator style

2. **Product Clarity:**
   - Does this depend on #1182 being done first?
   - Can we mock highways for now?
   - What are "highway layers"? (different routes? different types?)

**Deliverables Before Engineering:**
- [ ] Clarify dependency on #1182
- [ ] UX mockup: radar with highway layers
- [ ] Visual design: highway rendering style
- [ ] Define highway layer data (if not from #1182)

**Estimated Pre-Engineering Time:** 1-2 days (or BLOCKED by #1182)

---

### PHASE 1 - Pre-Engineering Needed (1 issue)

#### **#1209 - Relay radar widget** 🟡 MODERATE
**Status:** Based on existing widget, needs UX design
**Blocks:** #1211 (Relay station)
**Priority:** HIGH

**What's Defined:**
- Based on dradis radar
- Display/edit waypoints
- Create waypoint mode

**Needs Design:**
1. **UX Design:**
   - How does "create waypoint mode" work?
   - What does the cursor look like in create mode?
   - How to select waypoints (click? drag box? ?)
   - Multi-select for deletion?
   - Visual feedback for selection state

2. **Interaction Design:**
   - Mode switching UX (button? hotkey visual?)
   - Waypoint editing (move? just create/delete?)

**Deliverables Before Engineering:**
- [ ] UX mockup: waypoint creation/selection modes
- [ ] Interaction flow diagram
- [ ] Visual design: cursor, selection indicators

**Estimated Pre-Engineering Time:** 1-2 days

---

### PHASE 3 - Pre-Engineering Needed (3 issues)

All station issues need UX design for layouts and interactions:

#### **#1261 - Navigator station** 🟡 MODERATE
**Depends on:** #1262 (which needs design)

**Needs Design:**
1. **UX/Layout Design:**
   - Station screen layout
   - Widget arrangement
   - Hotkey UI indicators

**Deliverables Before Engineering:**
- [ ] Screen layout mockup
- [ ] Hotkey visualization design

**Estimated Pre-Engineering Time:** 1 day

---

#### **#1208 - Signals station** 🟡 MODERATE
**Depends on:** #1204, #1205, #1206 (multiple need design)

**Needs Design:**
1. **UX/Layout Design:**
   - 3-widget layout (radar, target info, jobs list)
   - Target info widget: 3 scan level views
   - Jobs list widget (covered by #1206)
   - Hotkey UI indicators
   - Filter toggle UI

**Deliverables Before Engineering:**
- [ ] Screen layout mockup (3 widgets)
- [ ] Target info widget design (3 states)
- [ ] Hotkey & filter visualization

**Estimated Pre-Engineering Time:** 2 days

---

#### **#1211 - Relay station** 🟡 MODERATE
**Depends on:** #1209, #1210, #1214

**Needs Design:**
1. **Product Clarity:**
   - Are probes needed? (marked TBD)
   - If yes, what do probes do?

2. **UX/Layout Design:**
   - Station screen layout
   - Widget arrangement
   - Hotkey UI indicators

**Deliverables Before Engineering:**
- [ ] Decision: probes scope (yes/no/defer)
- [ ] Screen layout mockup
- [ ] Probes design (if needed)

**Estimated Pre-Engineering Time:** 1-2 days

---

### PHASE 4 - Pre-Engineering Needed (5 issues)

All Phase 4 issues need significant design work:

#### **#1182 - Space highways / warp routes** 🔴 HIGH PRIORITY
**Status:** Concept only, needs full design
**May block:** #1262 (Navigator radar)
**Priority:** HIGH (if blocking #1262)

**Needs Design:**
1. **Product Design:**
   - What are space highways? (preset routes? faster travel? ?)
   - How do they work mechanically?
   - Static or dynamic?
   - Are they visible to all? Per-faction?

2. **Game Design:**
   - Benefits of using highways?
   - Penalties/risks?
   - How does warp relate to highways?

3. **Visual Design:**
   - How do highways appear on radar?
   - Multiple layers? Types?
   - Color coding?

4. **Technical Design:**
   - Data structure for highways
   - Pathfinding integration?
   - Performance considerations

**Deliverables Before Engineering:**
- [ ] Product spec: highway mechanics
- [ ] Game design doc: highway gameplay
- [ ] Visual design: highway rendering
- [ ] Technical design: data structures & integration

**Estimated Pre-Engineering Time:** 3-5 days

---

#### **#539 - Ship-in-ship docking** 🔴 COMPLEX
**Status:** High-level concept, needs comprehensive design
**Blocks:** #538 + 4 repair features (Phase 5)
**Priority:** DEPENDS ON LARP NEEDS

**Needs Design:**
1. **Product Design:**
   - Docking capability matrix (which ships in which ships)
   - What happens when docked? (still controllable? ?)
   - Can docked ships launch? How?
   - Does docking heal/repair?

2. **Game Design:**
   - Docking protocol (mutual? one-sided? approval needed?)
   - Docking range/positioning requirements
   - Time to dock/undock
   - Can docked ships be damaged?
   - Does parent ship's destruction affect docked ships?

3. **Technical Architecture:**
   - Parent-child relationship modeling
   - Position synchronization
   - Room management (dock closes ship room?)
   - State transitions & edge cases

4. **UX Design:**
   - Docking initiation UI
   - Status indicators (docked/docking/undocking)
   - Pilot controls when docked
   - Parent ship's view of docked ships

**Deliverables Before Engineering:**
- [ ] Product spec: docking rules & matrix
- [ ] Game design doc: docking mechanics & gameplay
- [ ] Technical architecture: state management & edge cases
- [ ] UX mockups: docking UI for both ships

**Estimated Pre-Engineering Time:** 5-7 days

---

#### **#548 - Cargo system** 🟡 MODERATE
**Status:** Concept only
**Related:** #539 (docking)

**Needs Design:**
1. **Product Design:**
   - What is cargo? (generic items? specific types? resources?)
   - Cargo capacity per ship model
   - How is cargo transferred? (docking required? beaming?)
   - Can cargo be destroyed/lost?

2. **Game Design:**
   - Purpose of cargo in LARP scenario
   - Cargo as mission objective?
   - Cargo affects ship performance?

3. **Technical Design:**
   - Cargo data model
   - Transfer mechanics
   - Integration with docking (#539)

4. **UX Design:**
   - Cargo management UI
   - Cargo station or existing station integration?

**Deliverables Before Engineering:**
- [ ] Product spec: cargo types & mechanics
- [ ] Game design: cargo role in LARP
- [ ] Technical design: data model & transfer
- [ ] UX mockup: cargo management UI

**Estimated Pre-Engineering Time:** 3-4 days

---

#### **#546 - Multiple ship models** 🟡 MODERATE
**Status:** Concept only, asset dependency unclear

**Needs Design:**
1. **Product Planning:**
   - How many ship models needed?
   - What differentiates them? (stats? capabilities? appearance?)
   - Are models faction-specific?

2. **Asset Planning:**
   - Do visual assets exist for multiple models?
   - If not, can we use variants (colors/scales) of existing?
   - If new assets needed, timeline?

3. **Technical Design:**
   - Ship model configuration system
   - Model selection (scenario setup? runtime?)
   - How do stats differ per model?

4. **Game Design:**
   - Balance between models
   - Player choice or scenario-defined?

**Deliverables Before Engineering:**
- [ ] Product spec: ship model list & differences
- [ ] Asset inventory/requirements
- [ ] Technical design: model configuration system
- [ ] Game balance: model stats

**Estimated Pre-Engineering Time:** 2-3 days (+ asset creation time if needed)

---

#### **#1188 - Nebula** 🟢 LOW PRIORITY
**Status:** Needs graphic assets

**Needs Design:**
1. **Visual Design:**
   - Nebula appearance (color, density, animation)
   - Multiple nebula types?
   - Visual effect on gameplay (obscures view?)

2. **Asset Creation:**
   - Create or source nebula sprites/shaders
   - Performance testing (lots of particles?)

3. **Product Design:**
   - Does nebula have gameplay effect? (hide ships? reduce scan?)
   - Or purely visual?

**Deliverables Before Engineering:**
- [ ] Visual design: nebula appearance
- [ ] Asset creation: nebula graphics
- [ ] Product decision: gameplay effect or visual only

**Estimated Pre-Engineering Time:** 1-2 days design + asset creation time

---

### PHASE 5 - Pre-Engineering Needed (5 issues)

All repair/dock features need comprehensive design:

#### **#538, #547, #549, #543, #545 - Repair/Dock System** 🟡 MODERATE
**Status:** Concepts only, all depend on repair system design
**Depends on:** #539 (docking)

**Needs Design (Unified Repair System):**

1. **Product Design:**
   - What can be repaired? (systems? hull? both?)
   - What resources are needed? (time? materials? ?)
   - Who can repair? (engineer station? repair station? automated?)
   - Can ships repair themselves vs others?

2. **Game Design:**
   - Repair rates/costs
   - Field repair vs station repair differences
   - Fighter-specific repair mechanics
   - Repair interruption (combat damage?)

3. **Technical Architecture:**
   - Repair state tracking
   - Progress calculation
   - Integration with damage system
   - Integration with docking (#539)

4. **UX Design:**
   - Repair station UI (#547)
   - Dock master UI (#538)
   - Field repair controls (#543)
   - In-station repair status (#545)
   - Damaged ships collection UI (#549)

**Deliverables Before Engineering:**
- [ ] Unified repair system design doc
- [ ] Product spec: repair mechanics & resources
- [ ] Game balance: repair rates & costs
- [ ] Technical architecture: repair state & integration
- [ ] UX mockups: all 5 repair/dock UIs

**Estimated Pre-Engineering Time:** 5-7 days (for all 5 issues together)

---

## Stakeholder Decision Points

These require decisions before design can proceed:

### Critical Decisions (Block Multiple Features)

1. **LARP Timeline** ⏰
   - **Affects:** All planning, prioritization
   - **Question:** What is the target date for "Mission in the Fringe"?
   - **Impact:** May force deferring Phase 4-5

2. **Fighters/Docking Critical?** ✈️
   - **Affects:** Phase 5 (5 issues), #539 (blocks Phase 5)
   - **Question:** Are fighters, docking, and repair critical for LARP?
   - **Decision:** Yes → Design #539 now; No → Defer entire Phase 5
   - **Impact:** 30-50% of remaining work

3. **Space Highways Design** 🛣️
   - **Affects:** #1182, potentially #1262 (Navigator radar)
   - **Question:** What are space highways and how do they work?
   - **Decision:** Critical for navigation → Design now; Nice-to-have → Mock/defer
   - **Impact:** May block Navigator station

### Medium Priority Decisions

4. **Cargo System Scope** 📦
   - **Affects:** #548, related to #539
   - **Question:** Is cargo gameplay part of LARP scenario?
   - **Decision:** Yes → Design now; No → Defer to later milestone

5. **Ship Models Needed** 🚀
   - **Affects:** #546
   - **Question:** How many ship models needed? Assets available?
   - **Decision:** Multiple models needed → Asset planning; One model OK → Defer

6. **Probes for Relay** 🛰️
   - **Affects:** #1211 (Relay station)
   - **Question:** Are probes needed for relay station?
   - **Decision:** Required → Add to design; Not needed → Remove from scope

---

## Pre-Engineering Timeline Estimates

### If All Features Required (Conservative)

**Critical Path Pre-Engineering:**
- #1205 (scan levels): 2-3 days
- #1206 (signals jobs): 3-5 days
- #1182 (space highways): 3-5 days
- #1262 (navigator radar): 1-2 days (after #1182)
- #1209 (relay radar): 1-2 days
- Stations UX (#1261, #1208, #1211): 4 days total
- #539 (docking): 5-7 days
- Repair system (Phase 5): 5-7 days
- #548 (cargo): 3-4 days
- #546 (ship models): 2-3 days

**Total: 29-43 days of design work**

### If Optimized Based on LARP Needs (Optimistic)

**Scenario: Defer Phase 4 (except highways) & Phase 5**

- #1205 (scan levels): 2-3 days
- #1206 (signals jobs): 3-5 days
- #1182 (space highways): 3-5 days
- #1262 (navigator radar): 1-2 days
- #1209 (relay radar): 1-2 days
- Stations UX: 4 days

**Total: 14-21 days of design work**

**Savings: 15-22 days by deferring Phase 4-5**

---

## Recommended Pre-Engineering Workflow

### Week 0: Stakeholder Decisions (1 week)
**Priority:** Get decisions on critical path blockers

1. ✅ Confirm LARP timeline
2. ✅ Decide: Fighters/docking/repair needed?
3. ✅ Decide: Cargo system needed?
4. ✅ Decide: Ship models priority
5. ✅ Decide: Probes for relay station

**Output:** Finalized scope for Phases 4-5

---

### Week 0.5-1: Critical Path Design (5 days)
**Priority:** Unblock engineering on Phase 1

**Day 1-2: Scan Levels (#1205)**
- Technical architecture
- Game mechanics
- UX design
- **Deliverable:** Design doc + mockups

**Day 3-5: Signals Jobs (#1206)**
- Product spec
- Technical design
- UX mockups
- **Deliverable:** Design doc + mockups

**Parallel Work:**
- Space highways decision (#1182)
- If needed: Start highway design

---

### Week 1.5: Radar & Station UX (5 days)
**Priority:** Unblock Phase 1 widgets & Phase 3 stations

**Day 1: Space Highways (#1182)** (if critical)
- Product/game design
- Visual design
- **Deliverable:** Highway spec + visual design

**Day 2: Navigator Radar (#1262)**
- UX mockup
- Integration with highways
- **Deliverable:** Widget mockup

**Day 3: Relay Radar (#1209)**
- Interaction design
- UX mockup
- **Deliverable:** Widget mockup + interaction flows

**Day 4-5: Stations Layout (#1261, #1208, #1211)**
- Screen layouts
- Hotkey UI
- **Deliverable:** All 3 station mockups

---

### Week 2: Phase 4 Design (If Needed) (5 days)
**Only if stakeholders confirmed needed**

**Day 1-3: Ship-in-Ship Docking (#539)**
- Product spec
- Technical architecture
- UX design
- **Deliverable:** Complete docking design

**Day 4-5: Cargo System (#548)** (if needed)
- Product spec
- Technical design
- **Deliverable:** Cargo design doc

**Parallel:** Ship models planning (#546) if needed

---

### Week 3: Phase 5 Design (If Needed) (5 days)
**Only if docking/repair confirmed**

**Day 1-5: Unified Repair System**
- Design covers all 5 repair issues (#538, #547, #549, #543, #545)
- Product spec
- Technical architecture
- UX mockups
- **Deliverable:** Complete repair system design

---

## Design Artifacts Needed

### Document Templates

1. **Product Spec Template:**
   - Feature overview
   - User stories
   - Requirements
   - Out of scope
   - Acceptance criteria

2. **Technical Design Template:**
   - Architecture overview
   - Data structures
   - API contracts
   - State management
   - Performance considerations
   - Testing strategy

3. **UX Design Template:**
   - User flows
   - Wireframes/mockups
   - Interaction patterns
   - Visual design specs
   - Accessibility notes

### Tools Recommended

- **Product Docs:** Markdown in `/docs/design/`
- **UX Mockups:** Figma, Excalidraw, or hand sketches
- **Technical Diagrams:** Mermaid in markdown
- **Asset Tracking:** GitHub issues with labels

---

## Risk Mitigation Strategies

### Risk: Design Takes Longer Than Estimated

**Mitigation:**
1. Use timeboxed design sessions (2-3 days max per feature)
2. Start with MVP scope, defer advanced features
3. Parallel design work where possible
4. Accept "good enough" designs to unblock engineering

### Risk: Engineering Starts Before Design Complete

**Mitigation:**
1. Clearly mark issues as "Blocked: Needs Design"
2. Engineers work on ready issues first (13 available)
3. Design reviews in daily standups
4. Fast-track critical path designs (#1205, #1206)

### Risk: Design Changes During Engineering

**Mitigation:**
1. Lock designs before engineering starts
2. Small design iterations only
3. Major changes → new issue, defer to later

### Risk: Stakeholder Decisions Delayed

**Mitigation:**
1. Set deadline for decisions (1 week)
2. Provide recommendations with pros/cons
3. Default to "defer Phase 4-5" if no decision

---

## Success Metrics

### Design Phase Complete When:
- [ ] All Critical Path issues have design docs (#1205, #1206)
- [ ] All Phase 1 widgets have UX mockups
- [ ] All Phase 3 stations have layout designs
- [ ] Stakeholder decisions documented
- [ ] Phase 4-5 scope finalized (do/defer)
- [ ] Engineers have clear requirements to start

### Engineering Ready Signal:
- ✅ Design doc approved by product owner
- ✅ UX mockups approved by stakeholders
- ✅ Technical architecture reviewed by lead engineer
- ✅ Issue updated with design artifact links
- ✅ Label changed: "Blocked: Needs Design" → "Ready for Engineering"

---

## Next Immediate Actions

### This Week (Design Kickoff):

1. **Schedule stakeholder decision meeting** (2 hours)
   - Review all 6 decision points
   - Get commitment on LARP timeline
   - Finalize Phase 4-5 scope

2. **Assign design owners:**
   - Product design: [OWNER]
   - UX design: [OWNER]
   - Technical architecture: [OWNER]

3. **Create design artifacts folder:**
   - `/docs/design/milestone-1/`
   - Templates for specs & mockups

4. **Start critical path design:**
   - #1205 (scan levels) - Day 1-2
   - #1206 (signals jobs) - Day 3-5

5. **Update GitHub issues:**
   - Add "Blocked: Needs Design" label to 14 issues
   - Add "Design: In Progress" label as work starts
   - Link design docs to issues when complete

---

**Document Version:** 1.0
**Last Updated:** 2025-11-06
**Owner:** Product/Design Team
**Related:** MILESTONE_1_PLAN.md
