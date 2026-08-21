---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/screens/engineer.ts
related:
  - ../UI_SPECIFICATION.md
  - ../ui/common-ui-patterns.md
  - ../design/stations/engineer.md
last_verified: 2026-08-18
---

# Engineer Screen — UI Specification

Implementation inventory for the Engineer screen: mounted widgets, source files, data bindings, and known pain points. For design intent and build status, see [`../design/stations/engineer.md`](../design/stations/engineer.md). For shared widget/panel patterns, see [`common-ui-patterns.md`](common-ui-patterns.md).

**File**: `modules/browser/src/screens/engineer.ts`
**URL**: `/engineer.html?ship={shipId}`
**Role**: Engineering officer - power and coolant management

## Overview
The Engineer screen provides detailed system management, power distribution, and coolant allocation. Primary focus on keeping systems operational and balanced. It is the ship's single engineering seat — always in full control of power, coolant, damage control and warp frequency.

## Functional Elements

### 1. Engineering Status Panel (Top-Left)
- **Widget**: `drawEngineeringStatus()` - Tweakpane panel
- **Properties**:
  - `hull`: Shows "OK" or "DAMAGED" (bound to `/hullDamaged`)
  - `energy`: Graph of reactor energy over time
  - `after-burner fuel`: Graph of afterburner fuel over time
- **Features**:
  - Graphs show history (Tweakpane graph blade)
- **Data Source**: `/hullDamaged`, `/reactor/energy`, `/maneuvering/afterBurnerFuel`

### 2. Full Systems Status Panel (Center)
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
- **Interactions**: Coolant sliders are always adjustable
- **Data Source**: All `/systems/*/power`, `/systems/*/heat`, `/systems/*/coolantFactor`, `/systems/*/hacked`, `/systems/*/broken`, defectibles

### 3. Warp Status Panel (Middle-Left)
- **Widget**: `drawWarpStatus()` - Same as Pilot screen
- **Additional Engineer Controls**:
  - `[` / `]` keys: Adjust standby frequency
  - `\` key: Trigger frequency change command
- **Data Source**: `/warp/*` (same as Pilot)

### 4. Armor Status (Bottom-Left)
- **Widget**: `drawArmorStatus()` - Same as Pilot screen
- **Size**: 200px minimum
- **Data Source**: `/armor/*` (same as Pilot)

## User Workflows

### Primary Workflow: Power Management
1. Monitor **Full Systems Status** table for system power levels
2. Identify critical systems needing power boost
3. Press number keys (**1-0, A-L**) to increase system power by 0.25 levels
4. Press corresponding lower row (**Q-P, Z-M**) to decrease power
5. Watch **energy** graph to ensure reactor can support power draw
6. Observe **EPM** column to see energy consumption rate

### Secondary Workflow: Coolant Allocation
1. Monitor **Heat** column in Full Systems Status
2. Identify overheating systems (yellow/red)
3. Press **Shift + number key** to increase coolant to system
4. Press **Shift + lower row** to decrease coolant
5. Balance coolant across systems (limited total coolant pool)
6. Watch **Heat** drop as coolant is applied

### Tertiary Workflow: Damage Response
1. Monitor **Status** column for DAMAGED/DISABLED systems
2. Check **defectibles** sub-row to see which components are broken
3. Reduce power to disabled systems to save energy
4. Reallocate coolant from disabled systems to functional ones
5. Report to captain which systems are offline

### Quaternary Workflow: Warp Frequency Management
1. Monitor **Warp Status** panel
2. Check if **Proximity Jam** is active
3. Use `[` or `]` to change **Designated FRQ**
4. Press `\` to trigger frequency change
5. Wait for **Calibration** to complete
6. Verify **Actual FRQ** matches **Designated FRQ**

## Current Pain Points

1. **Keyboard Mapping Complexity**: 19 key pairs (number + lower row) mapped to dynamic system list - not discoverable
2. **System Order Unknown**: Systems are listed in code order, not intuitive grouping - hard to find specific system quickly
3. **No Visual Keyboard Guide**: Users must memorize which key controls which system
4. **Coolant Pool Not Shown**: Total coolant available not displayed - users don't know limits
5. **EPM vs Energy**: Energy Per Minute shown but no prediction of when energy will run out
6. **Heat Status**: No threshold indicators - when does heat become critical?
7. **Defectibles Hidden**: Sub-rows with component health require scrolling/expansion
8. **No Damage History**: Can't see what got damaged when
9. **Table Scrolling**: 600px panel with many systems requires scrolling - can't see all at once

## Data Dependencies

### Real-time State (High Frequency)
- All system power levels (user-adjustable)
- All system heat levels (physics-based)
- All system coolant factors (user-adjustable)
- Reactor energy (consumption-based)
- Afterburner fuel (usage-based)

### Real-time State (Medium Frequency)
- System status (OK/DAMAGED/DISABLED) - changes on damage
- Energy Per Minute calculations - derived from power levels
- Hacked status - changes when a system is compromised
- Defectibles health - changes on damage to components

### Low Frequency / Event-driven
- Warp frequency changes
- System broken status

### State Requirements
- `ShipState.systems()`: All systems array
- `System.power`: PowerLevel enum (0-4)
- `System.heat`: Float32
- `System.coolantFactor`: Float32 (0-1)
- `System.hacked`: HackLevel enum
- `System.broken`: Boolean
- `System.energyPerMinute`: Computed value
- `System.defectibles[]`: Array of component health values
- `ShipState.design.totalCoolant`: Coolant pool size

## Technical Constraints

- **Table Plugin**: Uses tweakpane-table plugin for multi-column layout
- **Dynamic System List**: System count varies by ship design - UI must be flexible
- **Input Timing**: 500ms wait after key press to allow state sync (flaky)
- **Coolant Math**: Total coolant allocation must not exceed `design.totalCoolant`
- **Power Steps**: Power changes in 0.25 increments (PowerLevelStep constant)
- **Coolant Steps**: Coolant changes in 0.1 increments
- **CSS Hacks**: Manual min-width adjustments for Tweakpane labels/values
- **Theme System**: Data attributes (`data-status`) trigger CSS theme changes
