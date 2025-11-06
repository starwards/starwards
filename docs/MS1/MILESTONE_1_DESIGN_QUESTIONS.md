# Milestone 1: Design Session Questions

**Purpose:** Consolidated list of all design questions to be addressed in design sessions
**Generated:** 2025-11-06
**Status:** Open - Awaiting Design Session

---

## Table of Contents

1. [Stakeholder Decision Questions](#stakeholder-decision-questions)
2. [Critical Path Issues](#critical-path-issues)
3. [Phase 1 Issues](#phase-1-issues)
4. [Phase 3 Station Issues](#phase-3-station-issues)
5. [Phase 4 Advanced Features](#phase-4-advanced-features)
6. [Phase 5 Repair System](#phase-5-repair-system)
7. [Meta-Level Planning Questions](#meta-level-planning-questions)

---

## Stakeholder Decision Questions

**Priority:** CRITICAL - Must answer before detailed design
**Timeline:** Week 0 (1 week)

### Q1: LARP Timeline ⏰
**Context:** Determines scope and prioritization for all work

- What is the target date for "Mission in the Fringe" LARP?
- How much buffer time do we need before the event?
- Are there intermediate milestones/playtests planned?
- What is the drop-dead date for feature freeze?

**Impact:** Affects all planning, may force deferring Phase 4-5

---

### Q2: Fighters, Docking & Repair Critical? ✈️
**Context:** Phase 5 has 6 issues (including #539) representing ~30% of remaining work

- Are fighters part of the LARP scenario?
- Is ship-in-ship docking needed for gameplay?
- Are repair mechanics critical for the event?
- Can we run the LARP without these features?

**Decision Matrix:**
- If YES to any → Design #539 now, proceed with Phase 5
- If NO to all → Defer entire Phase 5 to post-LARP milestone
- If UNCERTAIN → Design lightweight MVP version

**Impact:** 30-50% of remaining work, 5-7 days of design time

---

### Q3: Space Highways Priority 🛣️
**Context:** May block Navigator radar (#1262) and Navigator station (#1261)

- What are space highways in the context of Mission in the Fringe?
- Are they critical for navigation gameplay?
- Can Navigator radar function without highways (show ship position only)?
- Are highways visible to all ships or faction-specific?

**Decision Matrix:**
- If CRITICAL → Design #1182 now (3-5 days)
- If NICE-TO-HAVE → Mock static highways for Navigator radar, design later
- If NOT NEEDED → Remove from Navigator radar, defer #1182

**Impact:** May block Navigator station (LARP-critical)

---

### Q4: Cargo System Scope 📦
**Context:** #548, related to docking (#539)

- Is cargo gameplay part of the LARP scenario?
- Are cargo missions/objectives planned?
- Does cargo need to be implemented before the LARP?

**Decision Matrix:**
- If YES → Design now (3-4 days)
- If NO → Defer to later milestone
- If UNCERTAIN → Design simple version (cargo as numeric value only)

**Impact:** 3-4 days design, blocks integration with #539

---

### Q5: Ship Models Needed 🚀
**Context:** #546, may require asset creation

- How many different ship models are needed?
- What differentiates them (stats? capabilities? visuals?)
- Do visual assets exist for multiple models?
- Are different models critical for LARP gameplay?

**Decision Matrix:**
- If 1 MODEL → Defer #546, use existing ship
- If 2-3 MODELS → Simple variant system (existing assets with stat differences)
- If 4+ MODELS → Requires asset creation, may need to defer

**Impact:** 2-3 days design + asset creation time

---

### Q6: Probes for Relay Station 🛰️
**Context:** #1211 (Relay station) has "TBD probes"

- Are probes needed for relay station functionality?
- If yes, what do probes do? (scan? deploy sensors? ?)
- Can relay station be functional without probes?

**Decision Matrix:**
- If REQUIRED → Add to relay station design (+ 1-2 days)
- If NOT NEEDED → Remove from scope
- If DEFER → Launch relay without probes, add later

**Impact:** Relay station design scope

---

## Critical Path Issues

**Priority:** URGENT - These block multiple features
**Timeline:** Week 0.5-1 (5 days)

---

### #1205 - Scan Levels Mechanic ⭐ HIGHEST PRIORITY

**Blocks:** #1206 (signals jobs), #1208 (signals station)

#### Technical Architecture Questions

1. **Data Structure:**
   - How do we store scan levels per-faction for each space object?
   - Data structure: `Map<factionId, Map<objectId, scanLevel>>` or `object.scanLevels[factionId]`?
   - Where is this stored: SpaceState? SpaceManager? Each object?
   - Performance: How many objects × factions do we expect? (N×M complexity)

2. **State Management:**
   - Who owns scan level changes: SpaceManager? Individual objects?
   - How are scan level changes synced to clients?
   - Do we sync all faction scan levels to all clients, or only relevant ones?

3. **API Design:**
   - What's the API for changing scan levels?
   - Who can change scan levels: GM only? Any ship? Automatic system?
   - How do we expose scan levels to client for radar display?

4. **Performance:**
   - If 50 objects × 5 factions = 250 scan level states
   - How do we optimize sync (only send deltas? client-side caching?)

#### Game Design Questions

5. **Scan Level Progression:**
   - How do scan levels increase?
     - Proximity-based (auto-increase when close)?
     - Active scanning action required?
     - Time-based (gradual reveal over time)?
     - Event-based (another ship shares intel)?
   - Can scan levels decrease (lose knowledge over time/distance)?
   - Are there cooldowns or resource costs for scanning?

6. **Scanning Mechanics:**
   - Is there a "scan" action ships can perform?
   - If yes, what's the cost (time? power? coolant?)
   - Range limits for scanning?
   - Can scanning be detected by the target?

7. **Initial States:**
   - What's the default scan level for new objects?
   - Do allied factions share scan levels automatically?
   - Special rules for stations vs ships?

8. **Game Balance:**
   - How long should it take to reach Lvl2 (full scan)?
   - Should some ships be better at scanning (sensors system bonus)?
   - Can countermeasures prevent scanning?

#### UX Design Questions

9. **Radar Display:**
   - How do we visually distinguish scan levels on radar?
     - Lvl0 (Unknown): Gray icon? Question mark? Generic dot?
     - Lvl1 (Basic): Faction color + ship icon?
     - Lvl2 (Advanced): Full detail + outline?
   - Color coding? Icon variations? Opacity levels?

10. **Player Feedback:**
    - How does player know scan level has changed?
    - Visual feedback (icon change? animation? notification?)
    - Audio cues?
    - Does scan level show in target info widget?

11. **GM Controls:**
    - How does GM manually set scan levels in tweak panel?
    - Per-faction controls? Or set for all factions at once?

---

### #1206 - Signals Jobs System

**Blocks:** #1208 (signals station)
**Depends on:** #1205 (scan levels)

#### Product Design Questions

1. **Available Actions:**
   - What actions can be queued as "jobs"?
     - Scan (increase scan level)?
     - Hack (requires Lvl2)?
     - Decrypt communications?
     - Track target?
     - Jam sensors?
     - Other?
   - Are different actions available based on ship systems/upgrades?

2. **Job Execution:**
   - How long does each job take (base time)?
   - Are timings same for all actions or different per action?
   - What determines success/failure probability?
   - Can jobs partially succeed (Lvl0 → Lvl1 instead of Lvl2)?

3. **Job Queue:**
   - What's the max queue size?
   - Does max size vary by ship/system status?
   - Can jobs be cancelled (refund? penalty?)
   - Can job order be changed (re-prioritize)?

4. **Resource Costs:**
   - Do jobs consume resources (power? coolant? something else?)
   - Is there a cooldown between jobs?
   - Are there any "free" jobs vs costly jobs?

#### Game Design Questions

5. **Malfunction Effects:**
   - Signals system malfunction increases:
     - Fail chance: By how much? (e.g., +20% fail chance per defect?)
     - Execution time: By how much? (e.g., +50% time per defect?)
     - Max queue: By how much? (e.g., -1 job slot per defect?)
   - Can jobs fail catastrophically (alert the target)?

6. **Hacking Mechanics:**
   - What can be hacked? (systems? intel? control?)
   - Hacking success rate? (always succeeds if Lvl2, or probability?)
   - Hacking duration?
   - Can hacking be detected by target?
   - Hacking effects (from #1207 hack mechanic)?

7. **Target Detection:**
   - Can other ships detect your signals jobs against them?
   - Is there a countermeasures mechanic?
   - Can targets jam your jobs?

8. **Job Priority:**
   - First-in-first-out only, or can priority be set?
   - Do different jobs have different queue priorities?

#### Technical Architecture Questions

9. **Job State Machine:**
   - Job states: Queued → Executing → Success/Failure?
   - Where is job state stored: ShipState? Signals system?
   - How do we handle job cancellation (mid-execution)?

10. **Server vs Client:**
    - Job execution server-side or client-side prediction?
    - How do we sync job progress to UI?
    - How do we handle disconnection mid-job?

11. **Job Data Model:**
    ```typescript
    interface SignalsJob {
      id: string;
      action: JobAction; // scan | hack | ...
      targetId: string;
      state: 'queued' | 'executing' | 'success' | 'failure';
      progress: number; // 0-1
      startTime?: number;
      estimatedEndTime?: number;
    }
    ```
    - Does this structure work?
    - What else is needed?

#### UX Design Questions

12. **Jobs List Widget:**
    - Layout: Table? Cards? List items?
    - What info shown per job: Action, Target name, Progress, ETA?
    - How to create new job (button? drag-drop target?)
    - How to cancel job (X button? right-click?)

13. **Job Progress:**
    - Progress indicator: Progress bar? Spinner? Percentage?
    - Visual distinction: Queued vs Executing vs Complete?
    - Success/failure feedback (color change? icon? notification?)

14. **Job Creation UI:**
    - Select action: Dropdown? Buttons? Hotkeys?
    - Select target: Click on radar? Dropdown? Current target auto?
    - Confirm dialog or instant queue?

---

### #1262 - Navigator Radar Widget

**Blocks:** #1261 (Navigator station)
**May depend on:** #1182 (space highways)

#### Product Clarity Questions

1. **Highway Dependency:**
   - Does this widget require #1182 (space highways) to be implemented first?
   - Can we build the widget with mocked/placeholder highway data?
   - Can the widget function without highways (just show ship position)?

2. **Highway Layers:**
   - What are "highway layers"?
     - Different routes (Route A, Route B, Route C)?
     - Different types (commercial, military, warp lanes)?
     - Different security levels (public, restricted, secret)?
   - How many layers are expected?

3. **Highway Data:**
   - If highways aren't ready yet, what placeholder data can we use?
   - Can we mock highways as simple line segments for now?

#### UX/Visual Design Questions

4. **Highway Rendering:**
   - How do highways appear visually?
     - Lines connecting waypoints?
     - Shaded corridors?
     - Dashed paths?
     - Animated flow?
   - Width of highway representation?
   - Do highways have directionality (arrows)?

5. **Color Coding:**
   - How are different highway layers distinguished?
     - Different colors per layer?
     - Different line styles (solid, dashed, dotted)?
     - Different opacity levels?
   - Standardized color palette?

6. **Layer Toggles:**
   - Where are toggle controls placed?
     - Buttons along edge of radar?
     - Checkboxes in separate panel?
     - Overlay on radar?
   - How to show which layers are active?
   - Toggle all on/off button?

7. **Ship Position Indicator:**
   - How is the ship's current position shown?
     - Center of radar (radar rotates)?
     - Or fixed position with scrollable map?
   - Ship icon style?
   - Heading indicator (arrow? line?)

8. **Zoom/Scale:**
   - Is zoom functionality needed?
   - Fixed scale or adjustable?
   - How to show scale (distance markers?)

---

## Phase 1 Issues

**Priority:** HIGH
**Timeline:** Week 1.5 (concurrently with critical path)

---

### #1209 - Relay Radar Widget

**Blocks:** #1211 (Relay station)
**Depends on:** #1185 (waypoints) ✅ DONE

#### UX Design Questions

1. **Waypoint Creation Mode:**
   - How does "create waypoint mode" activate?
     - Button toggle?
     - Hotkey toggle?
     - Auto-activate when waypoint layer selected?
   - Visual feedback when mode is active?
     - Border color change?
     - Status indicator?
     - Cursor change?

2. **Cursor Design:**
   - What does cursor look like in create mode?
     - Crosshair?
     - Waypoint icon preview?
     - Custom cursor image?
   - Does cursor snap to grid/positions?

3. **Waypoint Selection:**
   - How to select waypoints?
     - Click to select (highlight selected)?
     - Click-and-drag box select?
     - Ctrl+click for multi-select?
   - How to deselect (click empty space? ESC key?)

4. **Selection Visual Feedback:**
   - How are selected waypoints indicated?
     - Highlight glow?
     - Different color?
     - Selection border?
   - Multi-select indication (count badge? grouped highlight?)

5. **Waypoint Editing:**
   - Can waypoints be moved (drag) or only create/delete?
   - Can waypoint properties be edited (name? type?)?
   - Edit in-place or modal dialog?

6. **Layer Display:**
   - How are waypoint layers visually distinguished?
     - Different colors per layer?
     - Different icons per layer?
     - Layer name labels?
   - Can multiple layers be visible simultaneously?

#### Interaction Design Questions

7. **Mode Switching:**
   - User flow: View mode ↔ Create mode ↔ Edit mode?
   - Clear visual distinction between modes?
   - Can modes be combined (create + select simultaneously)?

8. **Waypoint Creation Flow:**
   - Click to create: Instant or confirm dialog?
   - Can creation be cancelled (ESC before click?)
   - Undo last waypoint?

9. **Waypoint Deletion:**
   - Delete selected waypoints: Button? Hotkey (DEL key?)
   - Confirmation dialog or instant delete?
   - Undo deleted waypoints?

10. **Mouse Interactions Summary:**
    - Left-click in create mode: Create waypoint?
    - Left-click in select mode: Select waypoint?
    - Left-click on empty: Deselect all?
    - Right-click: Context menu? Deselect?
    - Double-click: Edit waypoint properties?

---

## Phase 3 Station Issues

**Priority:** HIGH (LARP-CRITICAL)
**Timeline:** Week 1.5 (concurrently)

---

### #1261 - Navigator Station

**Depends on:** #1262 (navigator radar widget)

#### UX/Layout Design Questions

1. **Screen Layout:**
   - Single widget (radar only) or multiple widgets?
   - If multiple: What other widgets? (ship status? waypoint list?)
   - Widget arrangement: Radar full screen? Or radar + sidebar?

2. **Hotkey UI:**
   - How to display available hotkeys?
     - On-screen legend?
     - Tooltips on hover?
     - Help overlay (press H to show)?
   - Which hotkeys are most important to show always-visible?

3. **Highway Layer Toggles:**
   - Integrated into radar or separate control panel?
   - Hotkey indicators per layer (e.g., "1: Route A", "2: Route B")?
   - Visual feedback when layer toggled (toast notification? animation?)

4. **Waypoint Layer Selection:**
   - How to "select navigation waypoint layer to edit"?
     - Dropdown?
     - Tabs?
     - Hotkey cycle (Tab to next layer?)
   - Visual indicator of active layer?

5. **Waypoint Mode Indicators:**
   - How to show create/select mode status?
     - Status bar?
     - Mode indicator badge?
     - Button state (active/inactive)?

---

### #1208 - Signals Station

**Depends on:** #1204 (radar), #1205 (scan levels), #1206 (jobs system)

#### UX/Layout Design Questions

1. **3-Widget Layout:**
   - Long range radar placement (center? left? full screen?)
   - Target info widget placement (sidebar? top? bottom?)
   - Jobs list widget placement (sidebar? bottom?)
   - Proportions: Equal size or radar dominates?

2. **Target Info Widget:**
   - How to switch between 3 scan levels?
     - Tabs (Lvl0 | Lvl1 | Lvl2)?
     - Auto-show based on actual scan level only?
     - Always show all 3 sections (grayed if not available)?
   - Layout per level:
     - Lvl0: Distance, heading, rel.speed (table? gauges?)
     - Lvl1: + Faction badge, ship model icon?
     - Lvl2: + Armor bars, damage report list, systems list?

3. **Jobs List Widget:**
   - (Covered under #1206 questions)
   - Integration with target selection (auto-fill target in new job?)

4. **Hotkey UI:**
   - Zoom in/out indicators (Z/X keys? + - keys?)
   - Target navigation indicators (Tab/Shift+Tab? Arrow keys?)
   - Filter toggle indicators (U: Unknown, E: Enemy?)
   - On-screen legend vs tooltips?

5. **Filter Toggles:**
   - How to show filter state?
     - Toggle buttons (active/inactive)?
     - Checkboxes?
     - Icon badges with on/off state?
   - Where placed: Above radar? Below? Sidebar?

6. **Client-Side Target State:**
   - How is current target highlighted?
     - On radar: Pulsing outline? Different color?
     - In target info widget: Always shows current target?
   - Can target be changed from widget (click to target) or radar only?

---

### #1211 - Relay Station

**Depends on:** #1209 (radar), #1210 (toggle widget), #1214 (waypoints model)

#### Product Clarity Questions

1. **Probes Scope:**
   - *(See Stakeholder Q6)*
   - If probes are needed:
     - What do probes do?
     - How are they deployed?
     - Separate widget or integrated into radar?

#### UX/Layout Design Questions

2. **Station Layout:**
   - Dradis radar placement (center? full screen?)
   - Waypoints toggle widget placement (sidebar? bottom?)
   - If probes: Probe controls widget placement?

3. **Waypoint Visibility State:**
   - How to show which waypoint sets are shown/hidden?
     - Toggle widget handles this (from #1210)?
     - On-screen indicators on radar?

4. **Course Waypoint Selection:**
   - What is "course waypoint selection state"?
     - Active waypoint for autopilot?
     - Highlighted waypoint for navigation?
   - How is selected waypoint indicated on radar?
     - Pulsing? Different color? Label?

5. **Hotkey UI:**
   - Toggle waypoint layer indicators
   - Creation mode indicator
   - Delete waypoint indicator

---

## Phase 4 Advanced Features

**Priority:** MEDIUM (Depends on stakeholder decisions)
**Timeline:** Week 2 (if needed)

---

### #1182 - Space Highways / Warp Routes

**May block:** #1262 (navigator radar)

#### Product Design Questions

1. **Highway Concept:**
   - What are space highways in the game universe?
     - Pre-established routes through space?
     - Fast travel corridors (reduced travel time)?
     - Safe routes (less danger)?
     - Information superhighways (communication only)?

2. **Highway Mechanics:**
   - How do highways work mechanically?
     - Ship must follow highway path to get benefit?
     - Proximity bonus (benefits if near highway)?
     - Entry/exit points only?
   - What is the benefit of using highways?
     - Faster warp speed?
     - Fuel efficiency?
     - Easier navigation?
     - Communication range boost?

3. **Highway Structure:**
   - Are highways static or dynamic?
   - Do highways connect specific points (A to B) or general areas?
   - Can highways be damaged/destroyed/blocked?
   - Are new highways created during gameplay?

4. **Visibility:**
   - Are highways visible to all ships?
   - Or per-faction (some factions know secret routes)?
   - Or based on scan level (discover highways by exploring)?

#### Game Design Questions

5. **Navigation Gameplay:**
   - How do players interact with highways?
     - Autopilot follows highway?
     - Manual piloting along highway path?
     - Waypoints placed on highways?
   - Can ships leave highways mid-route?

6. **Warp Routes Relation:**
   - Are "warp routes" the same as "space highways"?
   - Or two separate concepts (highways for normal travel, warp routes for FTL)?

7. **Strategic Value:**
   - Do highways provide tactical advantage?
   - Can highways be contested (combat on highways)?
   - Are highways used for missions/objectives?

8. **Risks/Penalties:**
   - Any penalties for using highways?
     - Predictable route (ambush risk)?
     - Congestion/traffic?
     - Toll/cost?
   - Any penalties for NOT using highways?
     - Slower travel in "deep space"?
     - Navigation difficulty?

#### Visual Design Questions

9. **Highway Rendering:**
   - How should highways appear on radar?
     - Lines connecting waypoints/nodes?
     - Corridor zones (area of effect)?
     - Network graph (nodes + edges)?
   - Static display or animated (flow direction)?

10. **Highway Layers:**
    - What are the different layers?
      - Civilian vs military routes?
      - Different speed tiers (express, local)?
      - Different factions' preferred routes?
    - How many layers are needed for gameplay?

11. **Color Coding:**
    - How to distinguish layers visually?
    - Standard colors (e.g., blue=civilian, red=military)?
    - Color by destination (color-coded regions)?

12. **Scale & Density:**
    - How many highways in a typical play area?
    - Do highways clutter the radar or are they sparse?
    - Zoom levels for highway display (show at far zoom only)?

#### Technical Design Questions

13. **Data Structure:**
    ```typescript
    interface SpaceHighway {
      id: string;
      layer: string; // 'civilian' | 'military' | ...
      nodes: Vector2D[]; // Path waypoints
      visibleToFactions?: string[]; // Optional: faction-specific
      benefits?: { speedMultiplier?: number; /* ... */ };
    }
    ```
    - Does this structure work?
    - What else is needed?

14. **Highway Storage:**
    - Where are highways stored: SpaceState? Separate manager?
    - Are highways per-scenario (loaded from map file)?
    - Or generated procedurally?

15. **Performance:**
    - If many highways with many nodes, rendering optimization?
    - LOD (level of detail) based on zoom?
    - Caching/culling strategies?

16. **Pathfinding Integration:**
    - Should autopilot/AI use highways for pathfinding?
    - Highway network as pathfinding graph?
    - Weight edges by highway benefits?

---

### #539 - Ship-in-Ship Docking

**Blocks:** #538 (dock master) + 4 repair features

#### Product Design Questions

1. **Docking Capability Matrix:**
   - Which ships can dock into which other ships?
     - Fighters → Carriers?
     - Shuttles → Stations?
     - Any ship → Any larger ship?
   - Is docking symmetric (A docks with B = B docks with A)?
   - Maximum docked ships per parent ship?

2. **Docking State:**
   - What happens to docked ship?
     - Still controllable by pilot?
     - Control transferred to parent ship?
     - Docked ship becomes "cargo" (inactive)?
   - Can docked ship leave voluntarily or parent must release?

3. **Launching Docked Ships:**
   - How are docked ships launched?
     - Pilot initiates undock?
     - Parent ship ejects?
     - Automatic launch on parent ship destruction?
   - Launch positioning (where does ship appear)?

4. **Docking Effects:**
   - Does docking heal/repair docked ship?
   - Does docking refuel/rearm docked ship?
   - Can docked ships be repaired by parent ship systems?
   - Does parent ship provide protection (docked ships immune to damage)?

#### Game Design Questions

5. **Docking Protocol:**
   - Is docking mutual (both ships agree)?
   - Or one-sided (pilot initiates, parent auto-accepts)?
   - Can parent ship deny docking request?
   - Is there a "docking queue" (wait for bay availability)?

6. **Docking Requirements:**
   - Range requirement (distance threshold)?
   - Velocity requirement (must be stationary or slow)?
   - Positioning requirement (must approach from specific angle)?
   - Time to dock (instant or animation/countdown)?

7. **Undocking:**
   - Time to undock (instant or countdown)?
   - Can undocking be aborted?
   - Cooldown between docking/undocking?

8. **Damage Scenarios:**
   - Can docked ships be damaged?
     - Immune while docked?
     - Share parent ship's damage?
     - Separate health but parent ship damage can cascade?
   - If parent ship is destroyed:
     - Docked ships destroyed too?
     - Docked ships auto-eject (emergency launch)?
     - Docked ships become debris/loot?

9. **Gameplay Balance:**
   - What's the tactical advantage of docking?
     - Safety (repair/refuel)?
     - Transportation (parent carries fighters to combat zone)?
     - Strategy (hide ships inside parent)?
   - What's the disadvantage?
     - Vulnerable during docking (both ships)?
     - Limited parent ship mobility with docked ships?
     - Time cost (docking/undocking)?

#### Technical Architecture Questions

10. **Parent-Child Relationship:**
    - How to model docking relationship?
      - `parentShip.dockedShips: ShipState[]`?
      - `childShip.dockedInShip: string | null`?
      - Separate DockingManager?
    - Bidirectional references or single source of truth?

11. **Position Synchronization:**
    - Docked ship's position:
      - Relative offset from parent ship?
      - Snapped to docking bay position?
      - Invisible (inside parent)?
    - How is position updated when parent moves?

12. **Room Management:**
    - Does docked ship's room close?
    - Or does room stay open but UI shows "docked" state?
    - Can players switch between parent ship room and docked ship room?

13. **State Transitions:**
    - State machine: `Free ↔ Docking → Docked ↔ Undocking → Free`
    - How long in each state?
    - Can transitions be interrupted?

14. **Edge Cases:**
    - What if parent ship is destroyed while docking in progress?
    - What if parent ship moves away during docking?
    - What if docked ship is target of attack?
    - What if player disconnects while docked?
    - What if parent ship docks into another ship (nested docking)?

15. **Collision Detection:**
    - Do docked ships have collision boxes?
    - Or do they not collide (ghost mode)?

#### UX Design Questions

16. **Docking Initiation UI:**
    - How does pilot initiate docking?
      - Button on pilot station when near valid target?
      - Command sent via comms?
      - Automatic on approach?
    - Visual indicator of dockable ships (highlight? icon?)

17. **Docking Status Indicators:**
    - How to show docking in progress?
      - Progress bar?
      - Status message?
      - Animation?
    - How to show docked state?
      - UI badge "DOCKED"?
      - Different screen layout?
      - Icon on radar?

18. **Parent Ship's View:**
    - How does parent ship see docked ships?
      - List widget?
      - Radar overlay?
      - Separate docking bay screen?
    - Controls for launching docked ships?

19. **Pilot Station UI When Docked:**
    - What does pilot see when ship is docked?
      - Full station but controls disabled?
      - Limited "docked mode" UI?
      - Message "Ship is docked. Request undock to regain control."?

---

### #548 - Cargo System

**Related:** #539 (ship-in-ship docking)

#### Product Design Questions

1. **Cargo Definition:**
   - What is "cargo" in the game?
     - Generic items/resources?
     - Specific cargo types (food, weapons, fuel, intel)?
     - Mission-specific packages?
   - Are cargo items unique or commodities (stacks)?

2. **Cargo Capacity:**
   - Is cargo capacity per ship model or universal?
   - Capacity in:
     - Number of items (e.g., 10 cargo slots)?
     - Volume/weight (e.g., 100 tons)?
     - Abstract units (e.g., 50 cargo units)?
   - Can capacity be upgraded?

3. **Cargo Transfer:**
   - How is cargo transferred between ships?
     - Docking required (#539)?
     - Proximity transfer (no docking)?
     - Instant or takes time?
   - Can cargo be transferred during combat?
   - Can cargo be "dropped" in space (jettison)?

4. **Cargo Loss:**
   - What happens to cargo when ship is destroyed?
     - Lost forever?
     - Dropped as debris (can be recovered)?
     - Transferred to attacker (piracy)?

#### Game Design Questions

5. **Cargo Purpose:**
   - Why does cargo exist in the game?
     - Mission objectives (deliver cargo to X)?
     - Trade/economy gameplay?
     - Resource management?
     - Just flavor (background element)?

6. **Cargo Effects:**
   - Does cargo affect ship performance?
     - Slow down ship when full?
     - Reduce maneuverability?
     - Increase sensor signature (detectable)?
   - Or no mechanical effect (just tracked state)?

7. **Cargo Security:**
   - Can cargo be stolen (piracy)?
   - Can cargo be scanned by other ships?
   - Can cargo be hidden/smuggled?

8. **Cargo Missions:**
   - Are cargo delivery missions part of LARP?
   - If yes:
     - How are missions assigned (GM? Automated? Comms?)?
     - How is delivery verified?
     - Rewards for successful delivery?

#### Technical Design Questions

9. **Cargo Data Model:**
    ```typescript
    interface CargoItem {
      id: string;
      type: string; // 'food' | 'weapons' | 'intel' | ...
      quantity: number;
      volume?: number;
      metadata?: any; // Mission-specific data
    }

    interface ShipCargo {
      capacity: number;
      items: CargoItem[];
    }
    ```
    - Does this work?
    - What's missing?

10. **Cargo Storage:**
    - Where is cargo stored: ShipState? Separate inventory system?
    - Is cargo synced to all clients or server-only?

11. **Cargo Transfer Mechanics:**
    - Transfer API: `transferCargo(fromShip, toShip, cargoId, quantity)`?
    - Validation: Check capacity, docking state, etc?
    - Atomic transaction (all-or-nothing)?

#### UX Design Questions

12. **Cargo Management UI:**
    - Where is cargo UI?
      - New "Cargo" station?
      - Integrated into existing station (Engineering? Pilot?)?
      - GM-only UI (tweak panel)?
    - Layout: List? Grid? Icons?

13. **Cargo Transfer UI:**
    - How to initiate transfer?
      - Drag-drop between ships?
      - Select cargo + select target ship + confirm?
    - Visual feedback during transfer (progress bar)?

14. **Cargo Status Display:**
    - How to show cargo capacity?
      - Bar: [====-----] 40/100?
      - Percentage: 40% full?
      - List: 4/10 slots used?
    - Where to show (on all stations? dedicated widget?)

---

### #546 - Multiple Ship Models

#### Product Planning Questions

1. **Ship Model Count:**
   - How many different ship models are needed for LARP?
     - 1-2 (single model + variant)?
     - 3-5 (small variety)?
     - 6+ (rich variety)?

2. **Model Differentiation:**
   - What differentiates ship models?
     - **Stats:** Speed, hull, armor, shields?
     - **Capabilities:** Different systems available (some ships have missiles, others don't)?
     - **Appearance:** Just visual difference?
     - **Roles:** Fighter, bomber, carrier, scout, etc?

3. **Faction-Specific Models:**
   - Are ship models faction-specific?
     - Each faction has unique ships?
     - Or universal ship pool (any faction can use any ship)?
   - Do faction-specific models have mechanical differences or just visual?

#### Asset Planning Questions

4. **Visual Assets:**
   - Do visual assets exist for multiple ship models?
   - Current assets: How many ship sprites/models exist?
   - If new assets needed:
     - Can we use variants (recolor/rescale existing assets)?
     - Or must new assets be created from scratch?
     - Timeline for asset creation?

5. **Asset Requirements:**
   - What assets are needed per model?
     - Ship sprite (top-down view)?
     - Multiple rotations or single sprite?
     - Damage states (damaged/destroyed variants)?
     - Icon for UI (ship selection)?

#### Technical Design Questions

6. **Ship Model Configuration:**
   ```typescript
   interface ShipModel {
     id: string;
     name: string;
     stats: {
       maxSpeed: number;
       hullHP: number;
       armor: number;
       // ...
     };
     systems: string[]; // Available systems
     visual: {
       sprite: string;
       scale: number;
       // ...
     };
   }
   ```
   - Does this structure work?
   - What else is needed?

7. **Model Selection:**
   - How are ship models selected?
     - Scenario setup (GM assigns models to ships)?
     - Runtime (ships can change models)?
     - Ship creation (choose model when spawning)?
   - Can model change during gameplay (upgrade/downgrade)?

8. **Model Storage:**
   - Where are model definitions stored?
     - Hardcoded in code?
     - Config file (JSON)?
     - Database?
   - Per-scenario models or global ship catalog?

#### Game Design Questions

9. **Model Balance:**
   - How to balance different models?
     - Fighter: Fast, weak hull, low firepower?
     - Bomber: Slow, medium hull, high firepower?
     - Capital ship: Very slow, high hull, heavy firepower?
   - Are models balanced for PvP or PvE or both?

10. **Player Choice:**
    - Do players choose ship model?
    - Or is model assigned by scenario/GM?
    - Can players see other ships' models (UI indication)?

11. **Model Progression:**
    - Can ships upgrade to better models?
    - Or is model fixed for duration of scenario?

---

### #1188 - Nebula

#### Visual Design Questions

1. **Nebula Appearance:**
   - How should nebulae appear?
     - Cloud-like (organic shapes)?
     - Geometric (hexagons/cells)?
     - Particle effects (animated fog)?
   - Color palette (multiple colors? single color per nebula?)?

2. **Nebula Density:**
   - Single large nebula or multiple small ones?
   - Transparency/opacity (can see through nebula or opaque)?

3. **Animation:**
   - Static nebula or animated?
   - If animated: Slow drift? Pulsing? Swirling?
   - Performance considerations (lots of particles)?

#### Asset Creation Questions

4. **Asset Source:**
   - Create assets in-house or source externally?
   - If external: License for existing nebula graphics?
   - Asset format: PNG sprites? SVG? Particle system?

5. **Asset Variations:**
   - How many different nebula types?
   - Different sizes (small, medium, large)?
   - Different shapes (round, irregular, filament)?

#### Product Design Questions

6. **Gameplay Effect:**
   - Does nebula have gameplay effect?
     - **Option A:** Hide ships inside (reduce scan level)?
     - **Option B:** Slow down ships (navigation hazard)?
     - **Option C:** Damage ships (environmental damage)?
     - **Option D:** Purely visual (no mechanical effect)?
   - If gameplay effect: How strong? Balanced?

7. **Nebula Interaction:**
   - Can ships enter/exit nebula?
   - Is there a transition (fade in/out)?
   - Can nebulae move or are they static?

8. **GM Control:**
   - Can GM place nebulae dynamically?
   - Or are nebulae part of scenario setup only?
   - Can nebulae be destroyed/dispersed?

---

## Phase 5 Repair System

**Priority:** MEDIUM-LOW (Depends on stakeholder decisions)
**Timeline:** Week 3 (if needed)

**Note:** Issues #538, #547, #549, #543, #545 are all related to repair mechanics. Design should be unified.

---

### Unified Repair System Design Questions

#### Product Design Questions

1. **What Can Be Repaired:**
   - What types of damage are repairable?
     - System malfunctions (defects)?
     - Hull damage?
     - Armor damage?
     - Shield regeneration?
   - Can everything be repaired or are some things permanent?

2. **Repair Resources:**
   - What is needed to perform repairs?
     - **Time only** (repairs happen automatically over time)?
     - **Materials/parts** (consume repair resources)?
     - **Crew/engineers** (require engineer to perform repair)?
     - **Power/energy** (repairs drain power)?
   - Are resources scarce or plentiful?

3. **Who Can Repair:**
   - Which station performs repairs?
     - Engineering station (self-repair)?
     - Repair station (dedicated station)?
     - Dock master (repair docked ships)?
     - Automated (no player input, just time)?
   - Can any ship repair or only specific ships (repair ships)?

4. **Self-Repair vs Others:**
   - Can ships repair themselves?
   - Can ships repair other ships (field repair)?
   - Is there a difference in effectiveness (self-repair slower)?

#### Game Design Questions

5. **Repair Rates:**
   - How fast are repairs?
     - Instant (click to fix)?
     - Slow (minutes per repair)?
     - Variable (depends on damage severity)?
   - Does repair rate vary by:
     - Repair location (field vs station)?
     - Repairer type (engineer skill? ship capabilities?)?
     - Damage type (systems faster than hull)?

6. **Repair Costs:**
   - If resources required, how much per repair?
   - Are some repairs more expensive (hull > systems)?
   - Can you run out of repair resources?

7. **Field Repair vs Station Repair:**
   - What's the difference?
     - Field repair: Slower, partial repairs only?
     - Station repair: Faster, complete repairs?
   - Can field repair be interrupted (by combat)?

8. **Fighter-Specific Repairs:**
   - Are fighter repairs different from capital ship repairs?
     - Faster (fighters are smaller)?
     - Require carrier/station (fighters can't self-repair)?
   - Does #543 (field repair) and #545 (in-station repair) differ mechanically?

9. **Repair Interruption:**
   - Can repairs be interrupted?
     - By combat damage?
     - By ship movement?
     - By system failures?
   - If interrupted, does progress reset or pause?

10. **Repair Prioritization:**
    - If multiple systems damaged, can player choose repair order?
    - Or does system auto-prioritize (critical systems first)?

#### Technical Architecture Questions

11. **Repair State Tracking:**
    - How to track repair progress?
      - Per-system repair progress (0-100%)?
      - Single repair queue?
    - Where stored: ShipState? System state?

12. **Repair Calculation:**
    - How to calculate repair time/cost?
      - Formula based on damage amount?
      - Lookup table per system?
    - How to apply system effectiveness (malfunctioning repair system slows repairs)?

13. **Integration with Damage System:**
    - How does repair interact with existing damage system?
    - Does repair reverse damage (increase HP/armor)?
    - Or does repair fix malfunctions (remove defects)?

14. **Integration with Docking (#539):**
    - How does docking enable repairs?
    - Is docking required for all repairs or just some?
    - Does docking grant access to repair resources?

#### UX Design Questions

15. **Repair Station UI (#547):**
    - What does repair station screen show?
      - List of damaged systems?
      - Damage details (severity, type)?
      - Repair progress bars?
      - Resource availability?
    - Controls: Click system to start repair? Auto-repair toggle?

16. **Dock Master UI (#538):**
    - How to see docked ships?
      - List view? Grid view?
    - How to see docked ship's damage?
      - Click ship to see details?
      - Summary view (color-coded health)?
    - Controls:
      - Initiate repair on docked ship?
      - Launch docked ship (when ready)?

17. **Field Repair UI (#543):**
    - How does pilot/engineer initiate field repair on another ship?
      - Target ship + press repair button?
      - Proximity-based (auto-offer repair when close)?
    - Visual feedback (beam? progress indicator?)

18. **In-Station Repair UI (#545):**
    - Does fighter pilot see repair progress while docked?
      - UI in ship room?
      - Or blind (no UI until repairs complete)?
    - Can pilot see ETA for repairs?

19. **Collection of Damaged Ships UI (#549):**
    - What is "collection of damaged ships"?
      - Mission to tow damaged ships to station?
      - Storage bay for damaged ships awaiting repair?
    - UI: List of damaged ships? Map showing their locations?

---

## Meta-Level Planning Questions

**Purpose:** Questions about the design process itself to optimize execution

---

### Design Process Questions

#### Dependency Management

1. **Design Sequencing:**
   - Which designs must be completed first to unblock others?
   - Can we parallelize design work (different people on different issues)?
   - How do we handle circular dependencies (e.g., #539 ← → #548)?

2. **Design Debt:**
   - If we defer complex designs (#539, #548), what's the technical debt?
   - Can we design "seams" (extension points) now to make later integration easier?
   - Should we over-design now to future-proof, or minimal design for MVP?

3. **Iterative Design:**
   - Should we design everything upfront (waterfall)?
   - Or design-implement-feedback loop (agile)?
   - For which issues is iterative better (uncertain scope) vs upfront (clear scope)?

#### Handling Unknowns

4. **Unknown Unknowns:**
   - What aspects of the design are we not even aware we need to consider?
   - How do we surface hidden assumptions early?
   - Who are the domain experts to consult (LARP organizers? Players? GM?)?

5. **Scope Uncertainty:**
   - For issues marked "needs feature design" (#548, #1182, etc):
     - How much design detail is "enough"?
     - When do we stop designing and start implementing?
     - How do we prevent over-engineering?

6. **MVP Definition:**
   - What's the MVP for each feature?
   - Can we implement 20% of the design to get 80% of value?
   - Which features can ship incomplete (to be enhanced post-LARP)?

7. **Assumptions Documentation:**
   - How do we document design assumptions?
   - What happens if assumptions are wrong (discovered during implementation)?
   - Can we validate assumptions before full implementation (prototypes? mockups?)?

#### Feedback Loops

8. **Stakeholder Feedback:**
   - When do stakeholders review designs?
     - After each feature design?
     - Or batch review (all designs at once)?
   - How long for stakeholder feedback cycle (1 day? 1 week?)?
   - What if stakeholders disagree (who has final say)?

9. **Engineering Feedback:**
   - When do engineers review designs (before or after finalization)?
   - How do we incorporate technical feasibility feedback?
   - What if design is technically infeasible (redesign or defer feature)?

10. **Player/GM Feedback:**
    - Should designs be validated with actual LARP participants?
    - When to get their input (early design? prototype? beta?)?
    - How to incorporate their feedback (redesign vs minor tweaks)?

11. **Design Validation:**
    - How do we validate designs before implementation?
      - Paper prototypes?
      - Clickable mockups?
      - Code prototypes (spike)?
    - For which features is validation critical (high risk) vs optional (low risk)?

#### Resource Allocation

12. **Design Capacity:**
    - How many designers available?
    - How many designs can we work on in parallel?
    - Estimated design bandwidth (hours/week)?

13. **Design Prioritization:**
    - If design capacity is limited, which designs go first?
    - Critical path (#1205, #1206) always first, but then what?
    - Can we defer designs that are "nice to have" vs "must have"?

14. **Specialist Needs:**
    - Which designs need specialist input?
      - Product manager (feature scope)?
      - UX designer (user flows)?
      - Technical architect (system design)?
      - Artist (visual assets)?
    - Are specialists available or bottleneck?

#### Risk Management

15. **Design Risks:**
    - Which designs are highest risk (most uncertainty)?
    - How do we de-risk:
      - Research (look at similar games)?
      - Prototyping (build small proof-of-concept)?
      - Consultation (ask experts)?
    - Can we identify and mitigate risks before implementation starts?

16. **Implementation Risks:**
    - Which designs might be hard to implement (technical complexity)?
    - Should we adjust designs to be more implementation-friendly?
    - Or maintain design purity and accept higher implementation cost?

17. **Schedule Risks:**
    - What if design takes longer than estimated?
    - Contingency plan: Reduce scope? Extend timeline? Add resources?
    - How much schedule buffer to include?

18. **Quality Risks:**
    - What if rushed designs are poor quality (require rework)?
    - Is it better to delay implementation to improve design?
    - Or ship with "good enough" design and iterate post-release?

#### Design Artifacts

19. **Documentation Standards:**
    - What level of detail in design docs?
      - High-level overview only?
      - Detailed specs (every field, every interaction)?
    - Templates for design docs (product spec, technical design, UX mockup)?

20. **Design Deliverables:**
    - What artifacts are required per issue before engineering starts?
      - Written spec (markdown)?
      - Mockups (Figma? sketches?)?
      - Diagrams (architecture, flows)?
      - Acceptance criteria?
    - Who approves deliverables (product owner? tech lead?)?

21. **Design Maintenance:**
    - How do we keep designs up-to-date as implementation evolves?
    - Do we update design docs during implementation (living docs)?
    - Or treat designs as "point in time" (historical record)?

#### Communication & Collaboration

22. **Design Reviews:**
    - What's the design review process?
      - Formal meetings (design review board)?
      - Async reviews (comment on docs)?
      - Pair design (collaborative sessions)?
    - How long for review cycle?

23. **Cross-Team Coordination:**
    - How do we ensure designs are consistent across features?
      - Central design system/guidelines?
      - Regular sync meetings?
      - Shared mockups/assets?
    - Who owns cross-cutting concerns (e.g., hotkey standards)?

24. **Asynchronous Work:**
    - If team is distributed/async, how to collaborate on design?
    - Tools: Shared docs? Miro/Figma? GitHub issues?
    - How to avoid design conflicts (two people designing same thing)?

#### Success Criteria

25. **Design Completeness:**
    - How do we know a design is "done"?
      - All questions answered?
      - Stakeholder approval?
      - Engineer readiness sign-off?
    - Checklist for design completeness?

26. **Design Quality:**
    - How do we measure design quality?
      - Clarity (engineer understands what to build)?
      - Feasibility (can actually be implemented)?
      - Alignment (matches product vision and user needs)?
    - Who judges quality (design review board)?

27. **Design Effectiveness:**
    - Post-implementation: How do we know if design was good?
      - Feature works as designed (QA)?
      - Users happy with feature (feedback)?
      - Minimal rework needed (no design bugs)?
    - Retrospective: What did we learn to improve future designs?

---

## Next Steps for This Document

This document should be used as the agenda for design sessions:

1. **Stakeholder Decision Session (Week 0):**
   - Focus: Stakeholder Decision Questions (Q1-Q6)
   - Output: Decisions on scope for Phase 4-5
   - Duration: 2 hours

2. **Critical Path Design Session (Week 0.5-1):**
   - Focus: #1205, #1206, #1262 questions
   - Output: Design docs for critical path
   - Duration: 5 days

3. **Phase 1 & 3 Design Session (Week 1.5):**
   - Focus: Remaining Phase 1 & all Phase 3 questions
   - Output: Widget & station design docs
   - Duration: 5 days

4. **Phase 4 Design Session (Week 2, if needed):**
   - Focus: #1182, #539, #548, #546 questions
   - Output: Advanced features design docs
   - Duration: 5 days

5. **Phase 5 Design Session (Week 3, if needed):**
   - Focus: Unified repair system questions
   - Output: Repair system design doc
   - Duration: 5 days

6. **Design Process Retrospective:**
   - Focus: Meta-level planning questions
   - Output: Process improvements for next milestone
   - Duration: 1 hour

---

**Document Version:** 1.0
**Last Updated:** 2025-11-06
**Status:** Ready for Design Sessions
**Related Docs:**
- MILESTONE_1_PLAN.md
- MILESTONE_1_PREENGINEERING.md
