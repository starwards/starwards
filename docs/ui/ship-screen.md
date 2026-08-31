---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/screens/ship.ts
related:
  - ../UI_SPECIFICATION.md
  - ../ui/common-ui-patterns.md
  - ../ui/gm-screen.md
last_verified: 2026-08-18
---

# Ship Screen — UI Specification

Implementation inventory for the Ship screen: mounted widgets, source files, data bindings, and known pain points. There is no `docs/design/stations/` counterpart for this screen — it is a customizable multi-widget dashboard, not a fixed station. For shared widget/panel patterns, see [`common-ui-patterns.md`](common-ui-patterns.md); it shares its widget catalog with the [GM screen](gm-screen.md).

**File**: `modules/browser/src/screens/ship.ts`
**URL**: `/ship.html?ship={shipId}&layout={layoutName}`
**Role**: Customizable multi-station view

## Overview
The Ship screen provides a fully customizable dashboard for any ship. Used for single-player testing, custom station layouts, or multi-monitor setups. Inherits all widgets from GM screen but focuses on a single ship.

## Functional Elements

### 1. Dashboard System
- **Framework**: GoldenLayout (same as GM screen)
- **Menu**: Top menu bar with widget list
- **Available Widgets**: All 20 per-ship widgets from GM screen
  - radar, tactical radar, pilot radar, long range radar
  - helm, gun, design state, target radar
  - monitor, damage report, armor, ammo
  - tubes, systems, systems (full), engineering status
  - targeting, warp, docking, target info
- **Layout Parameter**: `?layout={name}` in URL
- **Layout Storage**: Saved to `localStorage` key `layout:{name}`
- **Layout Serialization**: Ship ID replaced with placeholder for reusability
- **Anonymous Mode**: No layout parameter = no persistence

### 2. Input Wiring
- **Function**: `wireSinglePilotInput()` - Full pilot controls
- **Enabled**: Pilot input active for keyboard/gamepad
- **Scope**: Only this ship (unlike GM which has no input)

## User Workflows

### Primary Workflow: Custom Station Creation
1. Navigate to `/ship.html?ship={id}&layout=mystation`
2. Open dashboard menu
3. Drag desired widgets onto canvas
4. Resize and arrange panels
5. Layout auto-saves to localStorage
6. Reload page - layout persists

### Secondary Workflow: Single-Player Testing
1. Create layout with essential widgets (radar, helm, systems, targeting)
2. Use keyboard/gamepad to pilot ship
3. Monitor all aspects in single view
4. No need to switch between station screens

### Tertiary Workflow: Multi-Monitor Setup
1. Open multiple browser windows
2. Each window: `/ship.html?ship={id}&layout={station}`
3. Create station-specific layouts:
   - Monitor 1: `layout=pilot` (radar, helm, warp)
   - Monitor 2: `layout=weapons` (tactical radar, targeting, tubes, ammo)
   - Monitor 3: `layout=engineering` (full systems, engineering status)
4. Each layout saved independently

## Current Pain Points

1. **Layout Management**: No UI to rename, duplicate, or delete layouts
2. **No Export/Import**: Can't share layouts between machines
3. **No Default Layout**: Blank canvas on first load - no starter template
4. **Ship ID Hardcoding**: Layout tied to specific ship ID (partially solved with placeholder)
5. **No Layout Preview**: Can't see what a saved layout looks like before loading
6. **Keyboard Conflicts**: Input manager always active - interferes with text inputs
7. **No Widget Favorites**: Can't mark frequently used widgets
8. **Menu Clutter**: All 20 widgets in flat list
9. **No Responsive**: Layout breaks on window resize
10. **No Help**: No indication of what each widget does

## Data Dependencies

### Same as GM Screen
- All ship state for selected ship
- All space state (for radar widgets)
- Dashboard layout config
- Input state (keyboard/gamepad)

### Unique to Ship Screen
- Layout name from URL parameter
- LocalStorage for layout persistence
- Ship ID serialization/deserialization

### State Requirements
- `ShipState`: Complete state for specified ship
- `SpaceState`: All space objects
- `Layout config`: GoldenLayout configuration object
- `Input mappings`: Pilot control configuration

## Technical Constraints

- **LocalStorage Quota**: 5-10MB limit (varies by browser)
- **JSON Serialization**: Layout config must be JSON-safe
- **Ship ID Replacement**: Regex-based replacement (fragile)
- **Layout Migration**: No versioning - breaking changes lose layouts
- **URL Length**: Long layout names may exceed URL limits
- **Input Interference**: Text inputs in widgets capture keystrokes
- **GoldenLayout Bugs**: Older version has known issues with resize
