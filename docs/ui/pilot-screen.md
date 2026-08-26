---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/screens/pilot.ts
related:
  - ../UI_SPECIFICATION.md
  - ../ui/common-ui-patterns.md
  - ../design/stations/pilot.md
last_verified: 2026-08-18
---

# Pilot Screen — UI Specification

Implementation inventory for the Pilot screen: mounted widgets, source files, data bindings, and known pain points. For design intent and build status, see [`../design/stations/pilot.md`](../design/stations/pilot.md). For shared widget/panel patterns, see [`common-ui-patterns.md`](common-ui-patterns.md).

**File**: `modules/browser/src/screens/pilot.ts`
**URL**: `/pilot.html?ship={shipId}`
**Role**: Helm officer - navigation and flight control

## Overview
The Pilot screen provides flight controls, navigation instruments, and situational awareness for maneuvering the ship. Primary focus on heading, speed, and spatial awareness.

## Functional Elements

### 1. Pilot Radar (Center/Main)
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

### 2. Pilot Stats Panel (Top-Left)
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

### 3. Systems Status Panel (Top-Right)
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

### 4. Armor Status (Bottom-Left)
- **Widget**: `drawArmorStatus()` - PixiJS circular visualization
- **Display**: Circular armor plate visualization
- **Features**:
  - Color gradient: Green (healthy) to Red (damaged)
  - Divided into plates (default 8 plates)
  - Real-time health updates
- **Size**: 200px minimum width
- **Data Source**: `/armor/armorPlates[*]/layers[*]/health`, `/armor/layerDesigns[*]/plateMaxHealth`

### 5. Warp Status Panel (Middle-Right)
- **Widget**: `drawWarpStatus()` - Tweakpane panel
- **Properties**:
  - `Actual LVL`: Current warp level (slider, read-only)
  - `Designated LVL`: Desired warp level (slider, read-only)
  - `Proximity Jam`: Jammed status (text, color-coded WARN)
  - `Actual FRQ`: Current frequency (text)
  - `Designated FRQ`: Standby frequency (text)
  - `Calibration`: Frequency change progress (slider)
- **Data Source**: `/warp/currentLevel`, `/warp/desiredLevel`, `/warp/jammed`, `/warp/currentFrequency`, `/warp/standbyFrequency`, `/warp/frequencyChange`

### 6. Docking Status Panel (Bottom-Right)
- **Widget**: `drawDockingStatus()` - Tweakpane panel
- **Properties**:
  - `Current Target`: ID of docking target
  - `Mode`: Docking mode (dropdown: DOCKED, UNDOCKED, DOCKING, UNDOCKING)
  - `Closest Option`: Nearest dockable object (computed every 250ms)
- **Data Source**: `/docking/targetId`, `/docking/mode`, computed from spatial index
- **Updates**: Polling loop for closest option

## User Workflows

### Primary Workflow: Flight Control
1. Use **WASD** keys or **gamepad left stick** to control thrust (forward/back) and strafe (left/right)
2. Use **QE** keys or **gamepad right stick** to control rotation
3. Monitor **heading** and **speed** in Pilot Stats panel
4. Watch **Pilot Radar** for obstacles and navigation
5. Adjust **warp level** with **R/F** keys
6. Activate **afterburner** with gamepad trigger for speed boost
7. Use **anti-drift** or **breaks** to stop movement

### Secondary Workflow: Docking
1. Navigate close to docking target (station/ship)
2. Check **Docking Status → Closest Option** for available targets
3. Press **Z** to toggle docking mode
4. Monitor docking alignment in **Pilot Radar**

### Tertiary Workflow: Mode Switching
1. Press gamepad button 10 to cycle **rotation modes** (manual/heading/target)
2. Press gamepad button 11 to cycle **maneuvering modes**
3. Monitor mode changes in **Pilot Stats** panel

## Current Pain Points

1. **Information Overload**: Pilot Stats panel shows 17 properties - hard to scan quickly for critical info
2. **Hidden Dependencies**: Rotation/maneuvering modes not explained - users don't understand what each mode does
3. **Radar Range**: No manual range control - automatic switching based on warp can be disorienting
4. **Fuel Awareness**: No visual warning when afterburner fuel is low
5. **Target Tracking**: `targeted` property shown but no indication of WHO is targeting
6. **Docking Feedback**: No visual indication of docking approach vector or alignment quality
7. **Gamepad-centric**: Keyboard controls are secondary - poor discoverability
8. **No Tutorial**: Complex control scheme with no in-UI help

## Data Dependencies

### Real-time State (High Frequency)
- Ship position, angle, velocity (60 Hz from physics)
- Rotation, boost, strafe commands (input polling)
- Energy, afterburner fuel (tick-based)
- All space objects for radar (up to 100+ objects)

### Real-time State (Medium Frequency)
- System status (power, heat, hacked) - changes on damage or commands
- Warp level, frequency
- Armor health per plate

### Low Frequency / Event-driven
- Docking target, mode
- Closest docking option (polled 250ms)
- Rotation/maneuvering mode changes

### State Requirements
- `ShipState`: Full ship state including subsystems
- `SpaceState`: All space objects for radar rendering
- `Faction`: For field-of-view calculations
- Commands: JSON Pointer paths to ship properties

## Technical Constraints

- **Performance**: Radar rendering at 60 FPS with 100+ objects
- **Latency**: Input → Server → State update → UI = ~50-100ms round trip
- **Synchronization**: Colyseus schema sync can drop frames under high load
- **Float Precision**: Speed/position values need `toBeCloseTo()` tolerance
- **Warp Transition**: Radar shape change (circle → cone) can be jarring
- **Memory**: PixiJS texture atlas management for radar sprites
- **Browser**: WebGL required for PixiJS rendering
