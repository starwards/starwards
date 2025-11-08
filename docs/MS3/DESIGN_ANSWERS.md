# Milestone 3: Design Answers

**Purpose:** Comprehensive design decisions for all Milestone 3 features
**Generated:** 2025-11-07
**Timeline:** 6+ months to LARP event
**Status:** In Progress

---

## Table of Contents

1. [Stakeholder Decisions](#stakeholder-decisions)
2. [Critical Path Designs](#critical-path-designs)
3. [Phase 1 Designs](#phase-1-designs)
4. [Phase 3 Station Designs](#phase-3-station-designs)
5. [Phase 4 Advanced Features](#phase-4-advanced-features)
6. [Phase 5 Repair System](#phase-5-repair-system)
7. [Implementation Priority](#implementation-priority)

---

## Stakeholder Decisions

### Q1: LARP Timeline ⏰
**Decision:** 6+ months timeline provides comfortable runway

**Implications:**
- Can implement full feature set without rushing
- Time for proper testing and iteration
- Can include Phase 4-5 features if desired
- Suggest 1-month feature freeze before event for stability

**Milestones:**
- Month 1-2: Core features (Phase 1, Critical Path)
- Month 3-4: Stations & advanced features
- Month 5: Polish, testing, rehearsals
- Month 6: Feature freeze, final prep

---

### Q2: Fighters, Docking & Repair ✈️
**Decision:** DOCKING & REPAIR CRITICAL, Fighters deferred

**Stakeholder Feedback:**
- Fighters NOT critical - can run LARP without them
- Docking MANDATORY - space stations are ships, must support docking
- Repair MANDATORY - IoT/Node-RED integration planned (MVP via GM panel)

**Scope:**
- **Critical:** Ship-to-station docking (may already be implemented?)
- **Critical:** Full repair system via Node-RED integration
- **Deferred:** Fighter-specific mechanics
- **MVP:** Repair via GM tweak panel until IoT ready

---

### Q3: Space Highways Priority 🛣️
**Decision:** MANDATORY - Warp frequency topology system

**Stakeholder Vision:**
Space has a topology correlating with warp engine frequencies. Each location has efficiency factors for different frequencies - following high-factor "veins" is more efficient than straight lines.

**Core Mechanics:**
- Each space position has warp efficiency factors per frequency
- Navigator plots optimal routes through high-efficiency veins
- Routes include frequency changes at specific points
- Navigator saves routes as waypoint series
- Relay station loads routes for pilot display

**Implementation:**
- Frequency topology map (grid-based efficiency factors)
- Multiple warp frequencies (e.g., Alpha, Beta, Gamma, Delta)
- Route optimization algorithm for Navigator
- Waypoint chain system with frequency metadata
- Route sharing between Navigator → Relay → Pilot

---

### Q4: Cargo System Scope 📦
**Decision:** DEFERRED - Not MVP

**Stakeholder Feedback:**
- Cargo system not required for LARP
- Can be added post-event if needed
- Focus resources on critical systems instead

---

### Q5: Ship Models Needed 🚀
**Decision:** MANDATORY - Rich collection of ship models

**Stakeholder Requirements:**
- Multiple distinct ship models for variety
- Each needs: System configuration, layout, text description
- 3D models NOT required for MVP (2D sprites sufficient)

**Proposed Models (6-8 types):**
1. **Scout** - Fast, minimal systems, 2 crew
2. **Corvette** - Light combat, 3-4 crew
3. **Frigate** - Balanced, 4-6 crew
4. **Destroyer** - Heavy combat, 5-7 crew
5. **Cruiser** - Command ship, 6-8 crew
6. **Carrier** - Support/docking, 6-10 crew
7. **Station** - Stationary hub, 10+ crew
8. **Merchant** - Trade/transport, 3-5 crew

**Each Model Needs:**
- System configuration (which systems available)
- Station layout (which stations active)
- Performance specs (speed, hull, armor)
- Text lore/description for players

---

### Q6: Probes for Relay Station 🛰️
**Decision:** MANDATORY - Probes required for relay

**Stakeholder Definition:**
- Probes are small mobile radars extending relay vision
- Fired into space to see beyond main radar range
- Essential for relay station functionality

**Probe Mechanics:**
- Launch probes from relay station
- Each probe acts as remote sensor
- Provides radar coverage at probe location
- Limited lifespan or fuel
- Can be repositioned or recalled

---

## Critical Path Designs

### #1205 - Scan Levels Mechanic ⭐

**Technical Architecture:**

```typescript
// Store in SpaceState for global access
interface SpaceState {
  scanLevels: Map<string, Map<string, ScanLevel>>;
  // factionId -> objectId -> level
}

enum ScanLevel {
  Unknown = 0,    // No information
  Basic = 1,      // Faction, type, position
  Advanced = 2    // Full details, enables targeting
}
```

**Game Mechanics:**
- **Progression:** Proximity-based + active scanning
  - Auto-progress to Lvl1 when within 500 units for 10 seconds
  - Active scan job for instant Lvl1 or Lvl1→Lvl2
  - Scan levels persist (no decay)

- **Scan Action:**
  - Cost: 10 power for 5 seconds
  - Range: 1000 units for active scan
  - Success rate: 100% if in range
  - Detectable: Target gets "Being Scanned" alert at Lvl2

**State Management:**
- Server authoritative (SpaceManager owns changes)
- Sync only relevant faction data to clients
- Delta updates via Colyseus state patches

**Visual Design:**
- Lvl0: Gray generic icon, "Unknown" label
- Lvl1: Faction color, ship type icon, basic info
- Lvl2: Full color, detailed icon, health bars visible

---

### #1206 - Signals Jobs System

**Job System Design:**

```typescript
interface SignalsJob {
  id: string;
  action: 'scan' | 'hack' | 'jam' | 'track';
  targetId: string;
  state: 'queued' | 'executing' | 'complete' | 'failed';
  progress: number; // 0-1
  startTime: number;
  duration: number; // milliseconds
  successChance: number; // 0-1
}

interface SignalsSystem extends SystemState {
  jobs: SignalsJob[];
  maxQueueSize: number; // 3 default, -1 per malfunction
  processingSpeed: number; // 1.0 default, -0.25 per malfunction
}
```

**Job Types & Timings:**
| Action | Base Duration | Power Cost | Requires |
|--------|--------------|------------|----------|
| Scan   | 5 seconds    | 10         | Lvl0/1 target |
| Hack   | 15 seconds   | 20         | Lvl2 target |
| Jam    | 10 seconds   | 15         | Lvl1+ target |
| Track  | Continuous   | 5/sec      | Lvl1+ target |

**Malfunction Effects:**
- Each defect: +25% duration, +20% fail chance, -1 queue slot
- At 3+ defects: 50% chance of alerting target on failure

**Queue Management:**
- FIFO execution, no priorities
- Cancel returns 50% power if queued, 0% if executing
- Jobs auto-retry once on failure (if power available)

---

### #1262 - Navigator Radar Widget

**Design Decision:** Build with mock highway data

**Mock Highway Structure:**
```typescript
interface Highway {
  id: string;
  name: string;
  layer: 'commercial' | 'military' | 'restricted';
  waypoints: Vector2D[];
  color: string;
  speedBonus: number; // 1.5 default
}
```

**Visual Design:**
- Highways as dashed lines between waypoints
- Layer colors: Commercial (blue), Military (red), Restricted (yellow)
- 3px line width, 50% opacity
- Arrow indicators every 200 units for direction

**Controls:**
- Toggle buttons for each layer (keyboard: 1,2,3)
- Ship always centered, radar rotates
- Zoom levels: 500, 1000, 2000, 5000 units (keyboard: +/-)
- Scale indicator in corner

---

## Phase 1 Designs

### #1209 - Relay Radar Widget

**Interaction Design:**

**Mode Controls:**
- Toggle button: "Create Mode" (keyboard: C)
- Visual: Orange border when active, crosshair cursor
- Exit: ESC or click toggle again

**Waypoint Interactions:**
| Action | Input | Result |
|--------|-------|--------|
| Create | Left-click in create mode | Add waypoint at cursor |
| Select | Left-click in view mode | Highlight waypoint |
| Multi-select | Ctrl+click | Add to selection |
| Delete | DEL key | Remove selected |
| Deselect | Click empty space | Clear selection |

**Visual Feedback:**
- Selected: White outline glow, 2px
- Hover: Scale 1.2x transition
- Creating: Ghost waypoint follows cursor
- Layers: Different icon shapes per layer

---

## Phase 3 Station Designs

### #1261 - Navigator Station

**Layout:** Single-widget focus design
```
[=====================================]
[          Navigator Radar            ]
[          (Full Screen)              ]
[=====================================]
[Status Bar: Mode | Layer | Zoom      ]
[=====================================]
```

**Hotkey Legend (always visible):**
- Bottom overlay bar with key indicators
- `1-3: Highway Layers | C: Create | Tab: Next Layer | +/-: Zoom`

**Layer Selection:**
- Tab cycles through editable waypoint layers
- Current layer shown in status bar
- Visual: Active layer waypoints 100% opacity, others 50%

---

### #1208 - Signals Station

**3-Widget Layout:**
```
[==================================]
[   Radar (60%)  | Target (40%)   ]
[                |                 ]
[                |-----------------|
[                | Jobs List       ]
[==================================]
```

**Target Info Widget States:**

```typescript
// Progressive disclosure based on scan level
Lvl0: {
  distance: number,
  heading: degrees,
  relativeSpeed: m/s
}

Lvl1: {
  ...Lvl0,
  faction: string (with badge),
  shipModel: string (with icon),
  designation: string
}

Lvl2: {
  ...Lvl1,
  hull: percentage,
  armor: [fore, aft, port, starboard],
  systems: SystemStatus[],
  cargo: number (if applicable)
}
```

**Jobs List Widget:**
- Table format: Action | Target | Progress | Status
- Progress bars with percentage text
- Color coding: Blue (queued), Yellow (executing), Green (success), Red (failed)
- Quick actions: Cancel button per job

**Filter Controls:**
- Toggle chips above radar
- States: Unknown (gray), Hostile (red), Friendly (green), Neutral (yellow)
- Keyboard: U, H, F, N

---

### #1211 - Relay Station with Probes

**Layout:**
```
[==================================]
[        Relay Radar (70%)         ]
[                                  ]
[==================================]
[ Probes (15%) | Waypoints (15%)  ]
[==================================]
```

**Probe System Design:**

```typescript
interface Probe {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  fuel: number; // 0-100
  range: number; // Radar coverage radius
  status: 'ready' | 'launching' | 'active' | 'returning' | 'destroyed';
  launchedBy: string; // Ship ID
}

interface ProbeControl {
  maxProbes: 3;
  availableProbes: number;
  activeProbes: Probe[];
  reloadTime: 60; // Seconds to build new probe
}
```

**Probe Mechanics:**
- Launch probes to extend radar coverage
- Each probe provides 500-unit radius visibility
- Control via click-to-move commands
- 100 fuel units = 10 minutes operation
- Can recall probes (if fuel > 20%)
- Destroyed if hit or out of fuel

**Probe UI Widget:**
```
[Active Probes (2/3)]
P1: [====------] 40% fuel [Recall]
P2: [========--] 80% fuel [Recall]
[Launch New Probe] (Ready in: 45s)
```

**Waypoint Toggle Widget:**
- Checkbox list of waypoint sets
- Shows count per set: "Navigation (12)"
- Batch actions: Show All / Hide All
- Visual preview: Mini icon + color per set

**Probe Controls:**
- Left-click probe icon: Select probe
- Right-click on radar: Move selected probe
- Double-click probe: Auto-return
- Hotkeys: 1-3 select probe, R recalls

---

## Phase 4 Advanced Features

### #1182 - Warp Frequency Topology

**Implementation:** Grid-based efficiency topology

```typescript
interface WarpTopology {
  gridResolution: number; // Units per grid cell (e.g., 100)
  frequencies: WarpFrequency[];
  efficiencyMap: Map<string, FrequencyEfficiency>;
  // gridKey -> frequency efficiencies
}

interface WarpFrequency {
  id: string; // 'alpha', 'beta', 'gamma', 'delta'
  name: string;
  baseEfficiency: number; // 0.1 to 1.0
  color: string; // For visualization
}

interface FrequencyEfficiency {
  position: Vector2D;
  efficiencies: Map<string, number>;
  // frequencyId -> efficiency (0.1 to 2.0)
}

interface WarpRoute {
  id: string;
  name: string;
  waypoints: WarpWaypoint[];
  totalDistance: number;
  estimatedTime: number;
}

interface WarpWaypoint {
  position: Vector2D;
  frequency: string; // Which frequency to use here
  efficiency: number; // Expected efficiency at this point
}
```

**Mechanics:**
- Space divided into grid cells (100x100 units)
- Each cell has efficiency factors for each frequency
- Warp speed = baseSpeed × frequencyEfficiency × systemPower
- Navigator sees efficiency heatmap overlay
- Route optimizer finds path through high-efficiency zones

**Navigator Workflow:**
1. Select destination
2. View efficiency layers for each frequency
3. Plot route through optimal zones
4. Mark frequency change points
5. Save as waypoint chain
6. Share to Relay station

**Visualization:**
- Heatmap overlay showing efficiency (red=low, green=high)
- Frequency selector to view different layers
- Route preview with efficiency indicators
- Frequency change markers on waypoints

---

### #539 - Ship & Station Docking

**Critical Note:** Stations are ships - must support station docking!

**Docking Rules Matrix:**
| Ship Type | Can Dock Into | Max Docked |
|-----------|---------------|------------|
| Scout     | Any Station | 0 |
| Corvette  | Any Station | 0 |
| Frigate   | Any Station | 0 |
| Destroyer | Any Station | 0 |
| Cruiser   | Any Station | 0 |
| Carrier   | Any Station | 4 small ships |
| Station   | N/A | 10+ ships |
| Merchant  | Any Station | 0 |

**Docking State Machine:**
```
Free → Approaching → Docking (5s) → Docked
Docked → Undocking (3s) → Free
```

**Docking Requirements:**
- Range: < 100 units
- Relative velocity: < 10 m/s
- Alignment: Within 45° of docking port
- Both ships consent (or auto-accept if same faction)

**While Docked:**
- Child ship UI shows "DOCKED" overlay
- Position locked to parent offset
- Immune to external damage
- Can receive repairs from parent
- Parent destruction = emergency ejection

**Technical Implementation:**
```typescript
interface ShipState {
  dockedShips: string[]; // Child ship IDs
  dockedInShip: string | null; // Parent ship ID
  dockingBays: DockingBay[];
}

interface DockingBay {
  id: string;
  occupied: boolean;
  shipId: string | null;
  position: Vector2D; // Relative offset
  maxSize: 'fighter' | 'frigate';
}
```

---

### #548 - Cargo System

**DEFERRED** - Not required for MVP per stakeholder feedback.

---

### #546 - Multiple Ship Models

**Comprehensive Ship Model System:**

```typescript
const SHIP_MODELS = {
  scout: {
    name: "Scout",
    description: "Fast reconnaissance vessel for exploration and intel gathering",
    crew: { min: 2, max: 3 },
    speed: { max: 250, acceleration: 25, warp: 2.0 },
    hull: 150,
    armor: [5, 5, 5, 5],
    systems: ['engines', 'sensors', 'signals'],
    stations: ['pilot', 'signals'],
    docking: { canDockIn: ['station', 'carrier', 'cruiser'] }
  },
  corvette: {
    name: "Corvette",
    description: "Light combat vessel, fast and maneuverable",
    crew: { min: 3, max: 4 },
    speed: { max: 180, acceleration: 18, warp: 1.5 },
    hull: 250,
    armor: [10, 10, 8, 8],
    systems: ['engines', 'weapons', 'shields', 'sensors'],
    stations: ['pilot', 'weapons', 'engineering'],
    docking: { canDockIn: ['station', 'carrier', 'cruiser'] }
  },
  frigate: {
    name: "Frigate",
    description: "Versatile medium warship for escort and patrol",
    crew: { min: 4, max: 6 },
    speed: { max: 120, acceleration: 12, warp: 1.2 },
    hull: 500,
    armor: [20, 20, 15, 15],
    systems: ['engines', 'weapons', 'shields', 'sensors', 'signals'],
    stations: ['pilot', 'weapons', 'engineering', 'signals', 'navigator'],
    docking: { canDockIn: ['station'] }
  },
  destroyer: {
    name: "Destroyer",
    description: "Heavy combat vessel with powerful weapons",
    crew: { min: 5, max: 7 },
    speed: { max: 100, acceleration: 8, warp: 1.0 },
    hull: 750,
    armor: [30, 30, 25, 25],
    systems: ['engines', 'weapons', 'shields', 'sensors', 'signals', 'missiles'],
    stations: ['pilot', 'weapons', 'engineering', 'signals', 'navigator', 'relay'],
    docking: { canDockIn: ['station'] }
  },
  cruiser: {
    name: "Cruiser",
    description: "Command vessel for fleet operations",
    crew: { min: 6, max: 8 },
    speed: { max: 80, acceleration: 6, warp: 0.8 },
    hull: 1000,
    armor: [35, 35, 30, 30],
    systems: ['engines', 'weapons', 'shields', 'sensors', 'signals', 'repair'],
    stations: ['pilot', 'weapons', 'engineering', 'signals', 'navigator', 'relay'],
    docking: { canDockIn: ['station'], canHost: 2 }
  },
  carrier: {
    name: "Carrier",
    description: "Support vessel with docking bays for smaller ships",
    crew: { min: 6, max: 10 },
    speed: { max: 60, acceleration: 4, warp: 0.6 },
    hull: 1200,
    armor: [40, 40, 35, 35],
    systems: ['engines', 'shields', 'sensors', 'signals', 'repair', 'docking'],
    stations: ['pilot', 'engineering', 'signals', 'navigator', 'relay', 'dock_master'],
    docking: { canDockIn: ['station'], canHost: 6 }
  },
  station: {
    name: "Station",
    description: "Stationary hub for docking, repairs, and operations",
    crew: { min: 10, max: 20 },
    speed: { max: 0, acceleration: 0, warp: 0 },
    hull: 2000,
    armor: [50, 50, 50, 50],
    systems: ['shields', 'sensors', 'signals', 'repair', 'docking', 'power'],
    stations: ['engineering', 'signals', 'relay', 'dock_master', 'repair'],
    docking: { canHost: 12 }
  },
  merchant: {
    name: "Merchant",
    description: "Civilian transport for trade and passengers",
    crew: { min: 3, max: 5 },
    speed: { max: 100, acceleration: 8, warp: 1.0 },
    hull: 400,
    armor: [15, 15, 10, 10],
    systems: ['engines', 'shields', 'sensors'],
    stations: ['pilot', 'engineering', 'navigator'],
    docking: { canDockIn: ['station'] }
  }
};
```

**Visual Strategy:**
- Use base sprite with different scales
- Faction color overlays
- Unique silhouettes via sprite variations

---

### #1188 - Nebula

**Pure Visual Implementation:**

**Design:**
- 2-3 nebula cloud sprites as transparent overlays
- No gameplay effect in MVP
- Static placement in scenario
- Particle system for subtle animation

**Future Enhancement Hooks:**
- `isInNebula()` check ready for mechanics
- Opacity can hide ships if needed later
- Performance-optimized for effects addition

---

## Phase 5 Repair System

### Unified Repair Design with IoT Integration

**Core Concept:** Node-RED controlled repair system (MVP via GM panel)

**Implementation Strategy:**
- **MVP:** GM tweak panel controls all repairs
- **Full:** Node-RED integration for physical repair stations
- **Future:** IoT devices trigger repair actions

**Repair Tiers:**
1. **Emergency Repair** (GM Panel / Node-RED)
   - Fix critical malfunctions remotely
   - Instant application via GM override
   - Node-RED can trigger based on sensor input

2. **Station Repair** (Docked at station)
   - Full repair: malfunctions + hull + armor
   - 2-5 minutes based on damage
   - Automatic when docked
   - Progress visible to dock master

3. **Field Repair** (Future enhancement)
   - Ship-to-ship repairs
   - Requires specialized repair ship
   - Can defer post-MVP

**Repair State:**
```typescript
interface RepairState {
  active: boolean;
  type: 'self' | 'field' | 'dock';
  target: string | null; // Ship being repaired
  progress: number; // 0-1
  startTime: number;
  duration: number;
  repairList: RepairItem[];
}

interface RepairItem {
  type: 'malfunction' | 'hull' | 'armor';
  system?: string;
  amount: number;
  completed: boolean;
}
```

**Station UIs:**

**Engineering Station Repair Widget:**
- List of damaged systems with repair buttons
- Progress bars during repair
- Power cost indicator
- Priority override controls

**Dock Master Station (#538):**
```
[Docked Ships List]
- Fighter-01 [====------] 40% Repaired [Launch]
- Fighter-02 [==========] Ready [Launch]
[Launch All] [Repair All]
```

**Field Repair UI (#543):**
- Target ship + "Request Repair" button
- Both ships get "REPAIRING" status
- Progress bar overlay
- Cancel button (abort repair)

---

## Implementation Priority

### Revised Priority Order (Based on Stakeholder Feedback):

**Phase 0: Pre-Check (Week 0.5)**
1. Verify docking implementation status
2. Check existing Node-RED integration
3. Assess current ship models

**Phase 1: Critical Path (Week 1-3)**
1. #1182 - **Warp frequency topology** (MANDATORY)
2. #1205 - Scan levels (blocks signals)
3. #1206 - Signals jobs system
4. #1262 - Navigator radar with frequency overlay

**Phase 2: Core Stations (Week 4-6)**
5. #1261 - Navigator station (with frequency routing)
6. #1208 - Signals station
7. #1211 - Relay station with **probes** (MANDATORY)
8. #1209 - Relay radar widget
9. #1210 - Toggle widget

**Phase 3: Mandatory Systems (Week 7-10)**
10. #539 - **Station docking** (if not implemented)
11. #546 - **8 ship models with full specs**
12. Probe system implementation
13. Warp route sharing (Navigator → Relay → Pilot)

**Phase 4: Repair & IoT (Week 11-14)**
14. #538, #547 - **Repair system with Node-RED**
15. GM panel repair controls (MVP)
16. IoT integration testing
17. Dock master station

**Phase 5: Polish (Week 15-18)**
18. #1188 - Nebula effects (visual only)
19. Performance optimization
20. Multi-ship stress testing
21. LARP scenario configuration

**Phase 6: Pre-Event (Week 19-24)**
- Player training sessions
- Full rehearsals
- Bug fixes only
- **Feature freeze Week 20**
- Documentation finalization

**Deferred Post-LARP:**
- #548 - Cargo system
- Fighter mechanics
- Field repairs (ship-to-ship)
- Advanced probe features

---

## Risk Mitigation

**High Risk Areas:**
1. **Docking system complexity** - Build simple version first, enhance iteratively
2. **Performance with many ships** - Profile early, optimize rendering
3. **Network sync overhead** - Use delta updates, client prediction
4. **UI complexity** - User test stations early with actual players

**Mitigation Strategies:**
- Build MVP versions first, enhance based on testing
- Weekly integration tests to catch issues early
- Regular performance profiling
- Player feedback sessions every 2 weeks

---

## Success Criteria

**Each Feature Must:**
- ✅ Have unit tests (> 80% coverage)
- ✅ Pass integration tests with ShipTestHarness
- ✅ Work with 10+ concurrent ships
- ✅ Sync properly across clients
- ✅ Have UI that works on 1080p displays
- ✅ Be documented in API_REFERENCE.md
- ✅ Support hotkeys where applicable
- ✅ Handle disconnection/reconnection

---

## Next Steps

1. **Review & Approve** - Stakeholder review of these decisions
2. **Create Issues** - Break down into GitHub issues with estimates
3. **Assign Teams** - Determine who implements what
4. **Begin Sprint 1** - Start with critical path items
5. **Weekly Reviews** - Assess progress and adjust

---

**Document Version:** 2.0
**Last Updated:** 2025-11-07
**Status:** Updated with Stakeholder Feedback
**Related Docs:**
- MILESTONE_1_PLAN.md
- MILESTONE_1_PREENGINEERING.md
- MILESTONE_1_DESIGN_QUESTIONS.md