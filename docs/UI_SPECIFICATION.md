# Starwards SBS UI Specification

**Version:** 1.0
**Date:** 2025-10-22
**Purpose:** Comprehensive specification of all UI screens and components

---

## Table of Contents

1. [Overview](#overview)
2. [UI Architecture](#ui-architecture)
3. [Pilot Screen](#pilot-screen)
4. [ECR Screen](#ecr-screen)
5. [Weapons Screen](#weapons-screen)
6. [GM Screen](#gm-screen)
7. [Ship Screen](#ship-screen)
8. [Input Screen](#input-screen)
9. [Common UI Patterns](#common-ui-patterns)
10. [Technical Constraints](#technical-constraints)

---

## Overview

The Starwards Space Bridge Simulator (SBS) UI consists of station-specific screens designed for multiplayer cooperative gameplay. Each station controls different aspects of a spaceship, requiring specialized interfaces optimized for their role.

### Design Philosophy
- **Station-specific**: Each screen tailored to specific crew role
- **Real-time**: All data synchronized via Colyseus WebSocket
- **Multi-input**: Keyboard, gamepad, and mouse support
- **Information density**: Critical data always visible

---

## UI Architecture

### Technology Stack
- **Rendering**: PixiJS (WebGL) for radar/graphics, Tweakpane for control panels
- **State Management**: Colyseus Schema (synchronized from server)
- **Layout**: jQuery + CSS for positioning, GoldenLayout for dashboard
- **Input**: Custom InputManager with gamepad/keyboard mapping

### Component Types
1. **Radar Widgets**: PixiJS-based graphical displays (pilot radar, tactical radar, GM radar)
2. **Control Panels**: Tweakpane-based property displays and inputs
3. **Status Displays**: Real-time numerical/textual information
4. **Visual Indicators**: Armor visualization, graphs, progress bars

### Container System
- **Root Container**: Full-screen wrapper (`#wrapper`)
- **Positioned Containers**: Absolute positioning with VPos/HPos (TOP/MIDDLE/BOTTOM, LEFT/MIDDLE/RIGHT)
- **Dashboard**: GoldenLayout for draggable/resizable panels (Ship and GM screens)

### Data Flow
```
Server ShipState/SpaceState
  → Colyseus Sync
  → ShipDriver/SpaceDriver
  → Property Wrappers (readProp/writeProp)
  → UI Widgets
  → User Input
  → Commands to Server
```

---

## Pilot Screen

**File**: `modules/browser/src/screens/pilot.ts`
**URL**: `/pilot.html?ship={shipId}`
**Role**: Helm officer - navigation and flight control

### Overview
The Pilot screen provides flight controls, navigation instruments, and situational awareness for maneuvering the ship. Primary focus on heading, speed, and spatial awareness.

### Functional Elements

#### 1. Pilot Radar (Center/Main)
- **Widget**: `drawPilotRadar()` - PixiJS-based radar
- **Data Source**: SpaceDriver (all space objects), ShipDriver (own ship)
- **Features**:
  - Circular radar (normal flight) or cone-shaped (warp mode)
  - Dynamically adjusts range: 5,000m (normal) / 100,000m (warp)
  - Field-of-view visualization (based on faction radar)
  - Azimuth circle with degree markings
  - Speed lines showing velocity vector
  - Movement anchor grid (1000m spacing)
  - Range indicators (5 rings)
  - Waypoints (in-range and out-of-range)
  - Visual target tracking
- **Interactions**: Read-only display, tracks ship automatically
- **Data**: `shipDriver.state.warp.currentLevel`, all space objects, faction field-of-view

#### 2. Pilot Stats Panel (Top-Left)
- **Widget**: `drawPilotStats()` - PropertyPanel
- **Properties Displayed**:
  - `energy`: Reactor energy level
  - `afterBurnerFuel`: Remaining afterburner fuel
  - `heading`: Current ship angle (0-360°)
  - `speed`: Current speed (m/s)
  - `turn speed`: Angular velocity (°/s)
  - `rotationMode`: Current rotation mode (enum: MANUAL, HEADING, etc.)
  - `rotationCommand`: Pilot's rotation input (-1 to 1)
  - `rotation`: Actual rotation being applied
  - `maneuveringMode`: Current maneuvering mode (enum)
  - `strafeCommand`: Pilot's strafe input (-1 to 1)
  - `boostCommand`: Pilot's thrust input (-1 to 1)
  - `strafe`: Actual strafe being applied
  - `boost`: Actual thrust being applied
  - `afterBurner`: Afterburner activation (0-1)
  - `antiDrift`: Anti-drift system status (0-1)
  - `breaks`: Brakes status (0-1)
  - `targeted`: Whether ship is being targeted (boolean)
- **Data Source**: `/reactor/energy`, `/maneuvering/*`, `/smartPilot/*`, `/angle`, `/speed`, `/turnSpeed`
- **Updates**: Real-time via property bindings

#### 3. Systems Status Panel (Top-Right)
- **Widget**: `drawSystemsStatus()` - Compact table view
- **Systems Shown**:
  - All thrusters (`/thrusters/*`)
  - Warp drive (`/warp`)
  - Radar (`/radar`)
  - Maneuvering (`/maneuvering`)
  - Smart Pilot (`/smartPilot`)
- **Columns**: Status, Power, Heat, Hacked
- **Visual**: Color-coded status (OK=green, WARN=yellow, ERROR=red)
- **Data Source**: `shipDriver.systems` filtered for relevant subsystems
- **Updates**: Real-time with color theme changes

#### 4. Armor Status (Bottom-Left)
- **Widget**: `drawArmorStatus()` - PixiJS circular visualization
- **Display**: Circular armor plate visualization
- **Features**:
  - Color gradient: Green (healthy) to Red (damaged)
  - Divided into plates (default 8 plates)
  - Real-time health updates
- **Size**: 200px minimum width
- **Data Source**: `/armor/armorPlates[*]/health`, `/armor/design/plateMaxHealth`

#### 5. Warp Status Panel (Middle-Right)
- **Widget**: `drawWarpStatus()` - Tweakpane panel
- **Properties**:
  - `Actual LVL`: Current warp level (slider, read-only)
  - `Designated LVL`: Desired warp level (slider, read-only)
  - `Proximity Jam`: Jammed status (text, color-coded WARN)
  - `Actual FRQ`: Current frequency (text)
  - `Designated FRQ`: Standby frequency (text)
  - `Calibration`: Frequency change progress (slider)
- **Data Source**: `/warp/currentLevel`, `/warp/desiredLevel`, `/warp/jammed`, `/warp/currentFrequency`, `/warp/standbyFrequency`, `/warp/frequencyChange`

#### 6. Docking Status Panel (Bottom-Right)
- **Widget**: `drawDockingStatus()` - Tweakpane panel
- **Properties**:
  - `Current Target`: ID of docking target
  - `Mode`: Docking mode (dropdown: NONE, AUTO, MANUAL)
  - `Closest Option`: Nearest dockable object (computed every 250ms)
- **Data Source**: `/docking/targetId`, `/docking/mode`, computed from spatial index
- **Updates**: Polling loop for closest option

### User Workflows

#### Primary Workflow: Flight Control
1. Use **WASD** keys or **gamepad left stick** to control thrust (forward/back) and strafe (left/right)
2. Use **QE** keys or **gamepad right stick** to control rotation
3. Monitor **heading** and **speed** in Pilot Stats panel
4. Watch **Pilot Radar** for obstacles and navigation
5. Adjust **warp level** with **R/F** keys
6. Activate **afterburner** with gamepad trigger for speed boost
7. Use **anti-drift** or **breaks** to stop movement

#### Secondary Workflow: Docking
1. Navigate close to docking target (station/ship)
2. Check **Docking Status → Closest Option** for available targets
3. Press **Z** to toggle docking mode
4. Monitor docking alignment in **Pilot Radar**

#### Tertiary Workflow: Mode Switching
1. Press gamepad button 10 to cycle **rotation modes** (manual/heading/target)
2. Press gamepad button 11 to cycle **maneuvering modes**
3. Monitor mode changes in **Pilot Stats** panel

### Current Pain Points

1. **Information Overload**: Pilot Stats panel shows 17 properties - hard to scan quickly for critical info
2. **Hidden Dependencies**: Rotation/maneuvering modes not explained - users don't understand what each mode does
3. **Radar Range**: No manual range control - automatic switching based on warp can be disorienting
4. **Fuel Awareness**: No visual warning when afterburner fuel is low
5. **Target Tracking**: `targeted` property shown but no indication of WHO is targeting
6. **Docking Feedback**: No visual indication of docking approach vector or alignment quality
7. **Gamepad-centric**: Keyboard controls are secondary - poor discoverability
8. **No Tutorial**: Complex control scheme with no in-UI help

### Data Dependencies

#### Real-time State (High Frequency)
- Ship position, angle, velocity (60 Hz from physics)
- Rotation, boost, strafe commands (input polling)
- Energy, afterburner fuel (tick-based)
- All space objects for radar (up to 100+ objects)

#### Real-time State (Medium Frequency)
- System status (power, heat, hacked) - changes on damage or commands
- Warp level, frequency
- Armor health per plate

#### Low Frequency / Event-driven
- Docking target, mode
- Closest docking option (polled 250ms)
- Rotation/maneuvering mode changes

#### State Requirements
- `ShipState`: Full ship state including subsystems
- `SpaceState`: All space objects for radar rendering
- `Faction`: For field-of-view calculations
- Commands: JSON Pointer paths to ship properties

### Technical Constraints

- **Performance**: Radar rendering at 60 FPS with 100+ objects
- **Latency**: Input → Server → State update → UI = ~50-100ms round trip
- **Synchronization**: Colyseus schema sync can drop frames under high load
- **Float Precision**: Speed/position values need `toBeCloseTo()` tolerance
- **Warp Transition**: Radar shape change (circle → cone) can be jarring
- **Memory**: PixiJS texture atlas management for radar sprites
- **Browser**: WebGL required for PixiJS rendering

---

## ECR Screen

**File**: `modules/browser/src/screens/ecr.ts`
**URL**: `/ecr.html?station=ecr&ship={shipId}`
**Role**: Engineering officer - power and coolant management

### Overview
The Engineering Control Room (ECR) screen provides detailed system management, power distribution, and coolant allocation. Primary focus on keeping systems operational and balanced.

### Functional Elements

#### 1. Engineering Status Panel (Top-Left)
- **Widget**: `drawEngineeringStatus()` - Tweakpane panel
- **Properties**:
  - `control`: Shows "ECR" or "Bridge" (who has control)
  - `energy`: Graph of reactor energy over time
  - `after-burner fuel`: Graph of afterburner fuel over time
- **Features**:
  - Graphs show history (Tweakpane graph blade)
  - Control status indicates if ECR or Bridge has system control
- **Data Source**: `/ecrControl`, `/reactor/energy`, `/maneuvering/afterBurnerFuel`
- **Control Toggle**: Backtick key (`) toggles ECR control on/off

#### 2. Full Systems Status Panel (Center)
- **Widget**: `drawFullSystemsStatus()` - Large table with all ship systems
- **Width**: 600px fixed
- **Table Headers**:
  - Status (60px): OK/DAMAGED/DISABLED
  - Power (60px): SHUTDOWN/LOW/MID/HIGH/MAX
  - EPM (60px): Energy Per Minute consumption
  - Heat (60px): Current heat level
  - Coolant (120px): Coolant factor slider (0-100%)
  - Hacked (60px): OK/COMPROMISED/DISABLED
- **Systems Listed**: All ship systems from `shipDriver.systems`
  - Reactor, Maneuvering, Thrusters (multiple), Tubes (multiple)
  - Radar, Smart Pilot, Warp, Docking, Magazine, Chain Gun
- **Sub-rows**: Each system has expandable defectibles row showing individual component health
- **Visual**: Color-coded by status (OK=green, WARN=yellow, ERROR=red)
- **Interactions**: Coolant sliders are adjustable when ECR has control
- **Data Source**: All `/systems/*/power`, `/systems/*/heat`, `/systems/*/coolantFactor`, `/systems/*/hacked`, `/systems/*/broken`, defectibles

#### 3. Warp Status Panel (Middle-Left)
- **Widget**: `drawWarpStatus()` - Same as Pilot screen
- **Additional ECR Controls**:
  - `[` / `]` keys: Adjust standby frequency
  - `\` key: Trigger frequency change command
- **Data Source**: `/warp/*` (same as Pilot)

#### 4. Armor Status (Bottom-Left)
- **Widget**: `drawArmorStatus()` - Same as Pilot screen
- **Size**: 200px minimum
- **Data Source**: `/armor/*` (same as Pilot)

### User Workflows

#### Primary Workflow: Power Management
1. Monitor **Full Systems Status** table for system power levels
2. Identify critical systems needing power boost
3. Press number keys (**1-0, A-L**) to increase system power by 0.25 levels
4. Press corresponding lower row (**Q-P, Z-M**) to decrease power
5. Watch **energy** graph to ensure reactor can support power draw
6. Observe **EPM** column to see energy consumption rate

#### Secondary Workflow: Coolant Allocation
1. Monitor **Heat** column in Full Systems Status
2. Identify overheating systems (yellow/red)
3. Press **Shift + number key** to increase coolant to system
4. Press **Shift + lower row** to decrease coolant
5. Balance coolant across systems (limited total coolant pool)
6. Watch **Heat** drop as coolant is applied

#### Tertiary Workflow: Damage Response
1. Monitor **Status** column for DAMAGED/DISABLED systems
2. Check **defectibles** sub-row to see which components are broken
3. Reduce power to disabled systems to save energy
4. Reallocate coolant from disabled systems to functional ones
5. Report to captain which systems are offline

#### Quaternary Workflow: Warp Frequency Management (ECR only)
1. Monitor **Warp Status** panel
2. Check if **Proximity Jam** is active
3. Use `[` or `]` to change **Designated FRQ**
4. Press `\` to trigger frequency change
5. Wait for **Calibration** to complete
6. Verify **Actual FRQ** matches **Designated FRQ**

### Current Pain Points

1. **Keyboard Mapping Complexity**: 19 key pairs (number + lower row) mapped to dynamic system list - not discoverable
2. **System Order Unknown**: Systems are listed in code order, not intuitive grouping - hard to find specific system quickly
3. **No Visual Keyboard Guide**: Users must memorize which key controls which system
4. **Control Confusion**: `/ecrControl` flag determines who can control - not always clear when bridge overrides
5. **Coolant Pool Not Shown**: Total coolant available not displayed - users don't know limits
6. **EPM vs Energy**: Energy Per Minute shown but no prediction of when energy will run out
7. **Heat Status**: No threshold indicators - when does heat become critical?
8. **Defectibles Hidden**: Sub-rows with component health require scrolling/expansion
9. **No Damage History**: Can't see what got damaged when
10. **Table Scrolling**: 600px panel with many systems requires scrolling - can't see all at once

### Data Dependencies

#### Real-time State (High Frequency)
- All system power levels (user-adjustable)
- All system heat levels (physics-based)
- All system coolant factors (user-adjustable)
- Reactor energy (consumption-based)
- Afterburner fuel (usage-based)

#### Real-time State (Medium Frequency)
- System status (OK/DAMAGED/DISABLED) - changes on damage
- Energy Per Minute calculations - derived from power levels
- Hacked status - changes on hacking events
- Defectibles health - changes on damage to components

#### Low Frequency / Event-driven
- ECR control flag toggle
- Warp frequency changes
- System broken status

#### State Requirements
- `ShipState.systems()`: All systems array
- `System.power`: PowerLevel enum (0-4)
- `System.heat`: Float32
- `System.coolantFactor`: Float32 (0-1)
- `System.hacked`: HackLevel enum
- `System.broken`: Boolean
- `System.energyPerMinute`: Computed value
- `System.defectibles[]`: Array of component health values
- `ShipState.design.totalCoolant`: Coolant pool size

### Technical Constraints

- **Table Plugin**: Uses tweakpane-table plugin for multi-column layout
- **Dynamic System List**: System count varies by ship design - UI must be flexible
- **Input Timing**: 500ms wait after key press to allow state sync (flaky)
- **Coolant Math**: Total coolant allocation must not exceed `design.totalCoolant`
- **Power Steps**: Power changes in 0.25 increments (PowerLevelStep constant)
- **Coolant Steps**: Coolant changes in 0.1 increments
- **CSS Hacks**: Manual min-width adjustments for Tweakpane labels/values
- **Theme System**: Data attributes (`data-status`) trigger CSS theme changes

---

## Weapons Screen

**File**: `modules/browser/src/screens/weapons.ts`
**URL**: `/weapons.html?ship={shipId}`
**Role**: Weapons officer - targeting and weapons control

### Overview
The Weapons screen provides tactical targeting, torpedo tube management, and ammunition tracking. Primary focus on engaging enemy targets and managing limited ammunition.

### Functional Elements

#### 1. Tactical Radar (Center/Main)
- **Widget**: `drawTacticalRadar()` - PixiJS-based radar
- **Range**: Fixed 5000m
- **Features**:
  - Circular radar with fog-of-war
  - Field-of-view based on faction radar range
  - Azimuth circle with degree markings
  - Crosshairs for chain gun (if equipped)
  - Speed lines showing target velocity
  - Range indicators (5 rings at 1000m intervals)
  - Blips colored by faction:
    - Green: Neutral/friendly
    - Red: Gravitas faction
    - Blue: Raiders faction
    - White: Projectiles
  - Visual target highlighting
- **Data Source**: SpaceDriver (all space objects), ShipDriver (own ship, chain gun)
- **Interactions**: Read-only display, shows currently selected target

#### 2. Tubes Status Panel (Top-Left)
- **Widget**: `drawTubesStatus()` - Tweakpane folders
- **Per Tube Display** (Tube 0, Tube 1, etc.):
  - `ammo to use`: Projectile type selected (text, read-only)
  - `ammo loaded`: Currently loaded projectile (text, read-only)
  - `loading`: Load progress slider (0-1, read-only)
  - `auto load`: Toggle for automatic reloading (checkbox)
- **Features**:
  - Each tube in separate folder (expanded by default)
  - Separators between tubes
  - Auto-load can be toggled per tube
- **Keyboard**:
  - `C` key: Toggle auto-load on Tube 0
  - `V` key: Change projectile type on Tube 0
  - `X` key: Fire Tube 0
- **Data Source**: `/tubes/[index]/projectile`, `/tubes/[index]/loadedProjectile`, `/tubes/[index]/loading`, `/tubes/[index]/loadAmmo`, `/tubes/[index]/isFiring`

#### 3. Ammunition Panel (Middle-Left)
- **Widget**: `drawAmmoStatus()` - Tweakpane panel
- **Projectile Types Shown**:
  - For each projectile type in `projectileModels`:
    - Display name (e.g., "EMP", "Nuclear", "Homing")
    - Count format: `{current} / {max}`
- **Data Source**: `/magazine/count_{type}`, `/magazine/max_{type}`, `/magazine/capacity`
- **Visual**: Text labels with current/max counts
- **Updates**: Real-time as ammunition is fired and reloaded

#### 4. Systems Status Panel (Top-Right)
- **Widget**: `drawSystemsStatus()` - Compact table
- **Systems Shown**:
  - All tubes (`/tubes/*`)
  - Chain gun (`/chainGun`)
  - Magazine (`/magazine`)
  - Radar (`/radar`)
- **Columns**: Status, Power, Heat, Hacked
- **Data Source**: Filtered systems from `shipDriver.systems`

#### 5. Targeting Panel (Middle-Right)
- **Widget**: `drawTargetingStatus()` - Tweakpane panel
- **Properties**:
  - `target`: ID of current target (text, read-only)
  - `Ship Only`: Toggle to filter for ships only (checkbox)
  - `Enemy Only`: Toggle to filter for enemies only (checkbox)
  - `Short Range`: Toggle to filter for close targets (checkbox)
- **Keyboard Controls**:
  - `]` key: Next target
  - `[` key: Previous target
  - `'` (apostrophe) key: Clear target
  - `P` key: Toggle Ship Only
  - `O` key: Toggle Enemy Only
  - `I` key: Toggle Short Range
- **Data Source**: `/weaponsTarget/targetId`, `/weaponsTarget/shipOnly`, `/weaponsTarget/enemyOnly`, `/weaponsTarget/shortRangeOnly`
- **Behavior**: Filters apply to next/prev target cycling

### User Workflows

#### Primary Workflow: Target and Fire
1. Use **Targeting Panel** filters to narrow down targets (ship only, enemy only, short range)
2. Press `]` or `[` to cycle through valid targets
3. Check **Tactical Radar** to verify target position and range
4. Ensure **Tubes Status** shows loaded ammunition
5. Press `X` to fire Tube 0 at target
6. Watch **Ammunition Panel** to track remaining ammo
7. Wait for tube to reload (monitor loading slider)

#### Secondary Workflow: Ammunition Management
1. Monitor **Ammunition Panel** for ammo counts
2. Check **Tubes Status → ammo to use** for current selection
3. Press `V` to cycle through available projectile types
4. Ensure **auto load** is enabled for automatic reloading
5. Coordinate with engineering to ensure magazine has power

#### Tertiary Workflow: Multiple Tube Management
1. Fire Tube 0 with `X`
2. Manually switch to Tube 1 in UI (no keyboard shortcut)
3. Fire additional tubes (currently only Tube 0 has keyboard binding)
4. Stagger reloads by disabling auto-load on some tubes
5. Save EMP/Nuclear rounds for high-value targets

### Current Pain Points

1. **Only Tube 0 Controllable**: Keyboard shortcuts only work for first tube - others require UI interaction
2. **No Multi-Fire**: Can't fire multiple tubes simultaneously
3. **Projectile Selection Hidden**: `V` key cycles projectile but no visual feedback of available types
4. **No Target Info**: Target ID shown but no type, faction, distance, or health
5. **Radar Range Fixed**: 5000m range may be too close or too far depending on situation
6. **No Fire Solution**: No lead indicator or time-to-target calculation
7. **Tube Cooldown**: Loading time shown but no estimated time to ready
8. **Chain Gun Missing**: Chain gun shown in status but no fire control
9. **No Ammo Warnings**: No alert when running low on specific ammo type
10. **Filter Persistence**: Targeting filters don't persist across reloads

### Data Dependencies

#### Real-time State (High Frequency)
- All space objects for radar (positions, factions, types)
- Current target ID
- Tube loading progress (0-1 per tube)
- Chain gun state (if equipped)

#### Real-time State (Medium Frequency)
- Ammunition counts (changes on fire/reload)
- Tube loaded projectile type
- System status (power, heat, hacked)

#### Low Frequency / Event-driven
- Target filters (ship only, enemy only, short range)
- Auto-load toggle per tube
- Projectile type selection per tube
- Fire command

#### State Requirements
- `ShipState.tubes[]`: Array of tube states
- `ShipState.magazine`: Ammunition inventory
- `ShipState.weaponsTarget`: Targeting system state
- `ShipState.chainGun`: Chain gun state (optional)
- `SpaceState`: All space objects for targeting
- `Projectile designs`: Projectile type definitions

### Technical Constraints

- **Targeting Filter Logic**: Applied server-side when cycling targets
- **Projectile Enum**: Fixed set of projectile types in core module
- **Tube Count**: Variable by ship design (usually 1-4 tubes)
- **Magazine Capacity**: Limited total capacity shared across all ammo types
- **Fire Rate**: Server-side cooldown prevents spam firing
- **Radar Performance**: 60 FPS with 100+ objects (same as Pilot radar)
- **Chain Gun**: Not all ships have chain gun - UI must handle null

---

## GM Screen

**File**: `modules/browser/src/screens/gm.ts`
**URL**: `/gm.html`
**Role**: Game Master - scenario control and testing

### Overview
The GM (Game Master) screen provides god-mode control over the game space. Used for scenario design, testing, and managing game sessions. Features a customizable dashboard with access to all ship widgets.

### Functional Elements

#### 1. GM Radar (Main/Left - 80% width)
- **Widget**: `GmWidgets.radar` - PixiJS-based god-mode radar
- **Features**:
  - Unlimited zoom (scroll wheel to zoom in/out)
  - Grid layer (aligned to zoom level)
  - Pan by dragging
  - View filter (dropdown: ALL, OBJECTS, WAYPOINTS)
  - Multi-select objects with drag box
  - Object manipulation:
    - Rotation: `E`/`Q` keys (5° steps)
    - Freeze: `F` key (toggle physics)
    - Delete: `Delete` key
  - Faction-colored field-of-view overlays:
    - Yellow: NONE faction
    - Red: Gravitas faction
    - Blue: Raiders faction
  - Blips colored by faction (same as Weapons screen)
  - Waypoints display with owner filtering
  - Interactive layer for object selection
- **Data Source**: SpaceDriver (all objects), selection state
- **Zoom Persistence**: Saved in layout state
- **Data Attribute**: `data-zoom` reflects current zoom level

#### 2. GM Controls Panel (Top-Right)
- **Widget**: Tweakpane panel
- **Properties**:
  - `type`: Filter dropdown (ALL, OBJECTS, WAYPOINTS)
- **Behavior**: Filter hides objects/waypoints on radar
- **Data Source**: Local view filter property

#### 3. Tweak Panel (Right - 20% width, tabbed)
- **Widget**: `tweakWidget()` - Dynamic property editor
- **Purpose**: Edit properties of selected objects
- **Features**:
  - Shows tweakable properties of selected object(s)
  - Supports bulk editing (multiple selected objects)
  - Property types: number, string, boolean, enum
- **Tab**: "Tweak" tab in right panel

#### 4. Create Panel (Right - 20% width, tabbed)
- **Widget**: `createWidget()` - Object spawning interface
- **Purpose**: Create new space objects
- **Features**:
  - Spawn ships, projectiles, asteroids, stations
  - Set initial properties (position, angle, faction, etc.)
  - Place at mouse cursor position
- **Tab**: "Create" tab in right panel

#### 5. Dashboard System
- **Framework**: GoldenLayout (draggable/resizable panels)
- **Menu**: Top menu bar with widget list
- **Per-Ship Widgets** (auto-registered for each ship in game):
  - `{shipId} radar`: Standard radar
  - `{shipId} tactical radar`: Tactical view
  - `{shipId} pilot radar`: Pilot view
  - `{shipId} helm`: Pilot stats
  - `{shipId} gun`: Gun controls
  - `{shipId} design state`: Ship configuration
  - `{shipId} target radar`: Target view
  - `{shipId} monitor`: System monitor
  - `{shipId} damage report`: Damage display
  - `{shipId} armor`: Armor visualization
  - `{shipId} ammo`: Ammunition status
  - `{shipId} tubes`: Tube status
  - `{shipId} systems`: Compact system status
  - `{shipId} systems (full)`: Full system status
  - `{shipId} engineering status`: Engineering panel
  - `{shipId} targeting`: Targeting panel
  - `{shipId} warp`: Warp controls
  - `{shipId} docking`: Docking panel
- **Layout Persistence**: Auto-save to localStorage
- **Dynamic Registration**: Widgets added as ships spawn

### User Workflows

#### Primary Workflow: Scenario Setup
1. Use **Create Panel** to spawn ships, stations, asteroids
2. Place objects at desired positions on **GM Radar**
3. Select objects with drag-box on radar
4. Use **Tweak Panel** to set properties (faction, orders, etc.)
5. Rotate objects with `E`/`Q` keys
6. Test scenario by observing ship behaviors

#### Secondary Workflow: Game Monitoring
1. Add ship widgets to dashboard (drag from menu)
2. Arrange panels in layout
3. Monitor multiple ships simultaneously
4. Switch view filters to focus on objects or waypoints
5. Zoom in/out to see different detail levels

#### Tertiary Workflow: Live Intervention
1. Select misbehaving ship on radar
2. Use **Tweak Panel** to change orders or state
3. Freeze ship with `F` if needed
4. Delete objects with `Delete` key
5. Spawn new objects to replace destroyed ones

#### Quaternary Workflow: Debugging
1. Open ship-specific widgets from menu
2. Compare expected vs actual state in panels
3. Check system status, damage, ammunition
4. Verify radar ranges, targeting, warp status
5. Test input by controlling ship directly

### Current Pain Points

1. **Overwhelming Widget List**: 19 widgets per ship - menu becomes huge with multiple ships
2. **No Search**: Can't search/filter dashboard menu for specific widget
3. **Layout Lost**: No named layouts - closing browser loses layout
4. **No Grouping**: Ship widgets not grouped by ship in menu
5. **Selection Feedback**: Selected objects not clearly highlighted on radar
6. **Bulk Edit Confusion**: Editing multiple objects - unclear which properties are shared
7. **Create Panel UX**: No preview of object before spawning
8. **No Undo**: Accidental deletes are permanent
9. **Zoom Limits**: Can zoom infinitely - easy to get lost
10. **Input Conflicts**: GM controls conflict with ship input when widgets are open

### Data Dependencies

#### Real-time State (High Frequency)
- All space objects (position, angle, velocity, type, faction)
- Object selection state
- Camera position and zoom
- Field-of-view calculations for all factions

#### Real-time State (Medium Frequency)
- Ship states (for all ship widgets)
- Tweakable properties of selected objects
- Waypoints (position, owner, collection)

#### Low Frequency / Event-driven
- Ship spawn/despawn
- Object creation/deletion
- View filter changes
- Dashboard layout changes
- Widget menu interactions

#### State Requirements
- `SpaceState`: Complete space state (all objects)
- `ShipState`: All ship states
- `Tweakable` metadata: Property definitions
- Selection container: Multi-select state
- Interactive layer commands: Create/delete/modify
- Dashboard layout: GoldenLayout config

### Technical Constraints

- **GoldenLayout Dependency**: Uses older GoldenLayout v1 API
- **Widget Registration**: Async ship detection requires `for await` loop
- **LocalStorage Limits**: Large layouts may exceed storage quota
- **Performance**: Rendering 100+ blips + FOV overlays at 60 FPS
- **Alpha Filters**: Field-of-view uses PixiJS alpha filters (GPU intensive)
- **Selection Box**: Custom selection logic may have edge cases
- **Zoom Persistence**: Stored in component state, not centralized
- **Input Manager**: Must not interfere with ship-specific input managers

---

## Ship Screen

**File**: `modules/browser/src/screens/ship.ts`
**URL**: `/ship.html?ship={shipId}&layout={layoutName}`
**Role**: Customizable multi-station view

### Overview
The Ship screen provides a fully customizable dashboard for any ship. Used for single-player testing, custom station layouts, or multi-monitor setups. Inherits all widgets from GM screen but focuses on a single ship.

### Functional Elements

#### 1. Dashboard System
- **Framework**: GoldenLayout (same as GM screen)
- **Menu**: Top menu bar with widget list
- **Available Widgets**: All 19 per-ship widgets from GM screen
  - radar, tactical radar, pilot radar
  - helm, gun, design state, target radar
  - monitor, damage report, armor, ammo
  - tubes, systems, systems (full), engineering status
  - targeting, warp, docking
- **Layout Parameter**: `?layout={name}` in URL
- **Layout Storage**: Saved to `localStorage` key `layout:{name}`
- **Layout Serialization**: Ship ID replaced with placeholder for reusability
- **Anonymous Mode**: No layout parameter = no persistence

#### 2. Input Wiring
- **Function**: `wireSinglePilotInput()` - Full pilot controls
- **Enabled**: Pilot input active for keyboard/gamepad
- **Scope**: Only this ship (unlike GM which has no input)

### User Workflows

#### Primary Workflow: Custom Station Creation
1. Navigate to `/ship.html?ship={id}&layout=mystation`
2. Open dashboard menu
3. Drag desired widgets onto canvas
4. Resize and arrange panels
5. Layout auto-saves to localStorage
6. Reload page - layout persists

#### Secondary Workflow: Single-Player Testing
1. Create layout with essential widgets (radar, helm, systems, targeting)
2. Use keyboard/gamepad to pilot ship
3. Monitor all aspects in single view
4. No need to switch between station screens

#### Tertiary Workflow: Multi-Monitor Setup
1. Open multiple browser windows
2. Each window: `/ship.html?ship={id}&layout={station}`
3. Create station-specific layouts:
   - Monitor 1: `layout=pilot` (radar, helm, warp)
   - Monitor 2: `layout=weapons` (tactical radar, targeting, tubes, ammo)
   - Monitor 3: `layout=engineering` (full systems, engineering status)
4. Each layout saved independently

### Current Pain Points

1. **Layout Management**: No UI to rename, duplicate, or delete layouts
2. **No Export/Import**: Can't share layouts between machines
3. **No Default Layout**: Blank canvas on first load - no starter template
4. **Ship ID Hardcoding**: Layout tied to specific ship ID (partially solved with placeholder)
5. **No Layout Preview**: Can't see what a saved layout looks like before loading
6. **Keyboard Conflicts**: Input manager always active - interferes with text inputs
7. **No Widget Favorites**: Can't mark frequently used widgets
8. **Menu Clutter**: All 19 widgets in flat list
9. **No Responsive**: Layout breaks on window resize
10. **No Help**: No indication of what each widget does

### Data Dependencies

#### Same as GM Screen
- All ship state for selected ship
- All space state (for radar widgets)
- Dashboard layout config
- Input state (keyboard/gamepad)

#### Unique to Ship Screen
- Layout name from URL parameter
- LocalStorage for layout persistence
- Ship ID serialization/deserialization

#### State Requirements
- `ShipState`: Complete state for specified ship
- `SpaceState`: All space objects
- `Layout config`: GoldenLayout configuration object
- `Input mappings`: Pilot control configuration

### Technical Constraints

- **LocalStorage Quota**: 5-10MB limit (varies by browser)
- **JSON Serialization**: Layout config must be JSON-safe
- **Ship ID Replacement**: Regex-based replacement (fragile)
- **Layout Migration**: No versioning - breaking changes lose layouts
- **URL Length**: Long layout names may exceed URL limits
- **Input Interference**: Text inputs in widgets capture keystrokes
- **GoldenLayout Bugs**: Older version has known issues with resize

---

## Input Screen

**File**: `modules/browser/src/screens/input.ts`
**URL**: `/input.html`
**Role**: Gamepad testing and input debugging

### Overview
The Input screen provides real-time visualization of gamepad inputs. Used for testing gamepad compatibility, debugging input mappings, and understanding gamepad layouts. Based on @maulingmonkey/gamepad library demo.

### Functional Elements

#### 1. Configuration Checkboxes (Top)
- **Dead Zone**: Apply 0.15 dead zone to axes (prevents drift)
- **Standardize**: Remap to standard gamepad layout
- **Keep Non-Standard**: Show non-standard gamepads
- **Keep Inactive**: Show disconnected gamepads

#### 2. Gamepad Metadata Table
- **Columns**:
  - Name: Parsed gamepad name
  - Index: Gamepad index (0-3)
  - Mapping: standard/unknown
  - Connected: true/false
  - Label: Human-readable device label
  - Vendor: Vendor ID (hex)
  - Product: Product ID (hex)
  - Hint: Additional metadata
  - Axes (0-10): 11 axis columns with live values
- **Data Source**: `navigator.getGamepads()` via @maulingmonkey/gamepad
- **Update Rate**: Polling via `requestAnimationFrame`
- **Visual**: Background color indicates axis value (blue=negative, green=positive)

#### 3. Gamepad Buttons Table
- **Columns**:
  - Name: Gamepad name
  - Index: Gamepad index
  - Buttons (0-37): 38 button columns with live values
- **Data Source**: `gamepad.buttons[]`
- **Visual**: Background color indicates press (cyan=not pressed, red=pressed)
- **Values**: Button pressure (0.00-1.00)

#### 4. Events Log Table
- **Columns**:
  - Type: Event type (connected, button-down, button-up, axis-value, etc.)
  - Gamepad Index: Which gamepad
  - Index: Button/axis index
  - Held: Held/released state
  - Value: Numeric value
  - Value Label: Human-readable label (e.g., "A button", "Left stick X")
- **Filtering**:
  - Keep button-value events (checkbox)
  - Keep near-zero events (checkbox)
- **Capacity**: Last 20 events

### User Workflows

#### Primary Workflow: Gamepad Testing
1. Connect gamepad to computer
2. Open `/input.html`
3. Check **Gamepad Metadata Table** for detection
4. Press buttons - verify in **Buttons Table**
5. Move sticks/triggers - verify in **Axes Table**
6. Check **Events Log** for event stream

#### Secondary Workflow: Input Mapping
1. Enable **Dead Zone** if analog stick drifts
2. Enable **Standardize** to test standard layout
3. Move specific axis - note which index lights up
4. Press specific button - note which index lights up
5. Cross-reference with `input-config.ts` mappings
6. Update mappings if indexes don't match

#### Tertiary Workflow: Debugging Input Issues
1. User reports "rotation doesn't work"
2. Open input screen
3. Move right stick - verify axis 0 lights up
4. Check **Events Log** for axis-value events
5. Verify dead zone is not too aggressive
6. Check gamepad mapping is "standard"

### Current Pain Points

1. **No Ship Context**: Can't test gamepad with actual ship - separate screen
2. **No Action Mapping**: Shows raw indices - doesn't map to game actions
3. **Overwhelming Data**: 11 axes + 38 buttons = information overload
4. **No Visualization**: Tables only - no visual gamepad diagram
5. **Event Flood**: Axis-value events spam the log
6. **No Recording**: Can't save input session for later analysis
7. **No Comparison**: Can't compare two gamepads side-by-side
8. **No Calibration**: Can't recalibrate dead zones or invert axes

### Data Dependencies

#### Real-time State (High Frequency)
- `navigator.getGamepads()`: Array of connected gamepads
- Gamepad axes (11 per gamepad, polled 60 Hz)
- Gamepad buttons (38 per gamepad, polled 60 Hz)

#### Real-time State (Low Frequency)
- Gamepad connection events
- Gamepad disconnection events

#### Static Data
- Configuration flags (dead zone, standardize, etc.)
- Event history buffer (last 20 events)
- Gamepad metadata (vendor, product, name)

#### State Requirements
- Browser Gamepad API support
- @maulingmonkey/gamepad library
- D3.js for table rendering and updates

### Technical Constraints

- **Browser Compatibility**: Gamepad API varies by browser
- **Gamepad Layout**: "standard" mapping not universal
- **Polling Required**: No native events for axis changes
- **Button Count**: 38 buttons may exceed physical buttons (padded)
- **Axis Count**: 11 axes may exceed physical axes (padded)
- **Dead Zone Math**: Applied in library, not configurable per-axis
- **Event Rate**: High frequency events can lag UI
- **No Ship State**: Completely isolated from game state

---

## Common UI Patterns

### Panel System (Tweakpane)

#### Property Display
- **Read-Only Text**: `addTextBlade()` - Shows string/number values
- **Slider**: `addSliderBlade()` - Shows numeric value with range
- **Graph**: `addGraph()` - Shows value history over time
- **Checkbox**: `addInputBlade()` - Boolean toggle
- **Dropdown**: `addListBlade()` - Enum selection
- **Ring**: `addConfig()` - Circular value (deprecated)

#### Panel Creation
```typescript
const pane = createPane({ title: 'Panel Title', container: element });
pane.element.dataset.id = 'Panel Title'; // For E2E testing
```

#### Property Binding
```typescript
const prop = readProp(shipDriver, '/path/to/property');
addTextBlade(pane, prop, { label: 'Display Name' }, cleanup.add);
```

#### Two-Way Binding
```typescript
const prop = readWriteProp(shipDriver, '/path/to/property');
addInputBlade(pane, prop, { label: 'Editable' }, cleanup.add);
```

#### Color-Coded Status
```typescript
blade.element.classList.add('tp-rotv'); // Enable theme overrides
blade.element.dataset.status = 'OK' | 'WARN' | 'ERROR';
// CSS in tweakpane.css applies colors based on data-status
```

### Radar System (PixiJS)

#### Camera Setup
```typescript
const camera = new Camera();
camera.bindRange(container, sizeFactor, { range: 5000 });
const root = new CameraView({ backgroundColor: radarFogOfWar }, camera, container);
```

#### Layers
1. **Background**: Grid or movement anchor layer
2. **FOV**: Field-of-view graphics (fog-of-war reveal)
3. **Objects**: Blips for ships, projectiles, etc.
4. **Overlays**: Crosshairs, speed lines, azimuth circle
5. **UI**: Range indicators, text labels

#### Object Rendering
```typescript
const layer = new ObjectsLayer(
  root,
  spaceDriver,
  blipSize,
  colorFunction,
  drawFunctions,
  targetObject,
  filterFunction
);
```

### Container Positioning

#### Root Container
```typescript
const container = wrapRootWidgetContainer($('#wrapper'));
```

#### Sub-Containers
```typescript
container.subContainer(VPos.TOP, HPos.LEFT);     // Top-left
container.subContainer(VPos.MIDDLE, HPos.RIGHT); // Middle-right
container.subContainer(VPos.BOTTOM, HPos.MIDDLE); // Bottom-center
```

### Input Handling

#### Range Actions (Analog)
```typescript
input.addRangeAction(readWriteNumberProp(shipDriver, '/path'), {
  axis: new GamepadAxisConfig(0, 0, [-0.1, 0.1]), // Gamepad
  offsetKeys: new KeysRangeConfig('w', 's', 'w+s,s+w', 0.05), // Keyboard
});
```

#### Toggle Actions (Boolean)
```typescript
input.addToggleClickAction(readWriteProp(shipDriver, '/path'), 'key');
```

#### Momentary Actions (Trigger)
```typescript
input.addMomentaryClickAction(writeProp(shipDriver, '/path'), 'key');
```

### Data Synchronization

#### Property Wrappers
- `readProp()`: Read-only, auto-updates on server change
- `writeProp()`: Write-only, sends commands to server
- `readWriteProp()`: Two-way binding
- `readNumberProp()`: Specialized for numeric values with range
- `aggregate()`: Combines multiple properties with transform function

#### Lifecycle
```typescript
const cleanup = new Destructors();
const pane = createPane({ title: 'Panel', container });
cleanup.add(() => pane.dispose());
container.on('destroy', cleanup.destroy);
```

---

## Technical Constraints

### Performance

#### Target Frame Rates
- Radar rendering: 60 FPS
- Panel updates: 30 FPS (via EmitterLoop)
- Input polling: 60 FPS (requestAnimationFrame)

#### Bottlenecks
- PixiJS: Rendering 100+ blips with FOV overlays
- Tweakpane: Table plugin with 20+ rows
- Colyseus: Network sync latency (50-100ms)
- Input: Multi-gamepad polling overhead

#### Optimizations
- Spatial indexing for object queries
- Dirty checking for property updates
- Layer masking for radar clipping
- UPDATE_PRIORITY for PixiJS ticker

### Browser Compatibility

#### Required Features
- WebGL (PixiJS)
- WebSocket (Colyseus)
- Gamepad API
- LocalStorage
- ES6+ (classes, async/await, modules)

#### Known Issues
- Safari: Gamepad API requires user gesture
- Firefox: WebGL performance lower than Chrome
- Mobile: Touch events not supported (desktop only)
- IE11: Not supported (no ES6)

### Network Synchronization

#### Colyseus Schema
- Automatic delta compression
- Binary serialization
- Property-level granularity
- OnChange callbacks for reactivity

#### Latency Impact
- Input → Server → State update: 50-100ms
- Visual feedback delayed by network latency
- Prediction/interpolation not implemented
- Players feel "lag" on high-latency connections

#### State Size
- Full ShipState: ~10KB serialized
- SpaceState with 100 objects: ~100KB
- Delta updates: 100-1000 bytes typical
- Bandwidth: ~10-50 KB/s per client

### Accessibility

#### Current State
- **Keyboard**: Full support for station controls
- **Gamepad**: Primary input method for pilot
- **Mouse**: Required for GM screen, optional for stations
- **Screen Readers**: NOT supported (no ARIA labels)
- **Color Blind**: Poor (relies on red/green/yellow heavily)
- **High Contrast**: No high-contrast mode
- **Font Scaling**: Breaks layout (fixed pixel sizes)

#### Improvements Needed
- ARIA labels for all panels and controls
- Colorblind-friendly palette option
- Keyboard navigation for dashboard
- Focus indicators for interactive elements
- Configurable font sizes
- Sound cues for critical events

### State Persistence

#### LocalStorage Usage
- Dashboard layouts: `layout:{name}` key
- Layout size: ~5-20 KB per layout
- No cleanup: Old layouts never deleted
- Quota: 5-10 MB (browser-dependent)

#### Session State
- URL parameters for ship ID, layout name, station type
- No cookies used
- No server-side session tracking
- Each tab is independent session

### Performance Budgets

#### Memory
- PixiJS textures: ~50 MB (texture atlases)
- Colyseus state: ~500 KB (100 objects)
- DOM nodes: ~1000 per screen
- Total: ~100 MB per tab

#### CPU
- PixiJS rendering: ~10ms per frame (60 FPS = 16ms budget)
- Property updates: ~5ms per frame
- Input polling: ~1ms per frame
- Network: ~1ms per frame
- Budget remaining: ~0ms (tight)

#### Network
- Initial state sync: ~100 KB
- Delta updates: ~10 KB/s
- Upstream commands: ~1 KB/s
- Total: ~10-20 KB/s per client

---

## Glossary

- **Blip**: Visual representation of space object on radar
- **Colyseus**: Multiplayer game server framework
- **Defectible**: Individual component within a system that can be damaged
- **Driver**: Client-side wrapper for server state (ShipDriver, SpaceDriver)
- **ECR**: Engineering Control Room
- **FOV**: Field of View (radar visibility area)
- **GM**: Game Master
- **JSON Pointer**: Path syntax for addressing nested properties (e.g., `/thrusters/0/power`)
- **PropertyPanel**: Legacy panel system (deprecated in favor of Tweakpane blades)
- **SBS**: Space Bridge Simulator
- **Schema**: Colyseus data structure with automatic synchronization
- **Spatial Index**: Acceleration structure for fast object queries
- **Tweakpane**: UI library for control panels
- **Widget**: Self-contained UI component (panel, radar, display)
- **@gameField**: Decorator marking properties for network sync

---

**End of Specification**

This document provides a complete functional specification of the Starwards SBS UI as of 2025-10-22. All screens, widgets, workflows, pain points, and technical constraints have been documented based on source code analysis and E2E test specifications.
