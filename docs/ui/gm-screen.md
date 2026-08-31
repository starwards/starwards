---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/screens/gm.ts
related:
  - ../UI_SPECIFICATION.md
  - ../ui/common-ui-patterns.md
  - ../design/stations/gm.md
last_verified: 2026-08-18
---

# GM Screen — UI Specification

Implementation inventory for the GM screen: mounted widgets, source files, data bindings, and known pain points. For design intent and build status, see [`../design/stations/gm.md`](../design/stations/gm.md). For shared widget/panel patterns, see [`common-ui-patterns.md`](common-ui-patterns.md).

**File**: `modules/browser/src/screens/gm.ts`
**URL**: `/gm.html`
**Role**: Game Master - scenario control and testing

## Overview
The GM (Game Master) screen provides god-mode control over the game space. Used for scenario design, testing, and managing game sessions. Features a customizable dashboard with access to all ship widgets.

## Functional Elements

### 1. GM Radar (Main/Left - 80% width)
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

### 2. GM Controls Panel (Top-Right)
- **Widget**: Tweakpane panel
- **Properties**:
  - `type`: Filter dropdown (ALL, OBJECTS, WAYPOINTS)
- **Behavior**: Filter hides objects/waypoints on radar
- **Data Source**: Local view filter property

### 3. Tweak Panel (Right - 20% width, tabbed)
- **Widget**: `tweakWidget()` - Dynamic property editor
- **Purpose**: Edit properties of selected objects
- **Features**:
  - Shows tweakable properties of selected object(s)
  - Supports bulk editing (multiple selected objects)
  - Property types: number, string, boolean, enum
- **Tab**: "Tweak" tab in right panel

### 4. Create Panel (Right - 20% width, tabbed)
- **Widget**: `createWidget()` - Object spawning interface
- **Purpose**: Create new space objects
- **Features**:
  - Spawn asteroids, ships, explosions, and waypoints
  - Set initial properties (position, angle, faction, etc.)
  - Place at mouse cursor position
- **Tab**: "Create" tab in right panel

### 5. Dashboard System
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
  - `{shipId} target info`: Target information
  - `{shipId} long range radar`: Long range radar view
- **Layout Persistence**: Auto-save to localStorage
- **Dynamic Registration**: Widgets added as ships spawn

## User Workflows

### Primary Workflow: Scenario Setup
1. Use **Create Panel** to spawn ships, stations, asteroids
2. Place objects at desired positions on **GM Radar**
3. Select objects with drag-box on radar
4. Use **Tweak Panel** to set properties (faction, orders, etc.)
5. Rotate objects with `E`/`Q` keys
6. Test scenario by observing ship behaviors

### Secondary Workflow: Game Monitoring
1. Add ship widgets to dashboard (drag from menu)
2. Arrange panels in layout
3. Monitor multiple ships simultaneously
4. Switch view filters to focus on objects or waypoints
5. Zoom in/out to see different detail levels

### Tertiary Workflow: Live Intervention
1. Select misbehaving ship on radar
2. Use **Tweak Panel** to change orders or state
3. Freeze ship with `F` if needed
4. Delete objects with `Delete` key
5. Spawn new objects to replace destroyed ones

### Quaternary Workflow: Debugging
1. Open ship-specific widgets from menu
2. Compare expected vs actual state in panels
3. Check system status, damage, ammunition
4. Verify radar ranges, targeting, warp status
5. Test input by controlling ship directly

## Current Pain Points

1. **Overwhelming Widget List**: 20 widgets per ship - menu becomes huge with multiple ships
2. **No Search**: Can't search/filter dashboard menu for specific widget
3. **Layout Lost**: No named layouts - closing browser loses layout
4. **No Grouping**: Ship widgets not grouped by ship in menu
5. **Selection Feedback**: Selected objects not clearly highlighted on radar
6. **Bulk Edit Confusion**: Editing multiple objects - unclear which properties are shared
7. **Create Panel UX**: No preview of object before spawning
8. **No Undo**: Accidental deletes are permanent
9. **Zoom Limits**: Can zoom infinitely - easy to get lost
10. **Input Conflicts**: GM controls conflict with ship input when widgets are open

## Data Dependencies

### Real-time State (High Frequency)
- All space objects (position, angle, velocity, type, faction)
- Object selection state
- Camera position and zoom
- Field-of-view calculations for all factions

### Real-time State (Medium Frequency)
- Ship states (for all ship widgets)
- Tweakable properties of selected objects
- Waypoints (position, owner, collection)

### Low Frequency / Event-driven
- Ship spawn/despawn
- Object creation/deletion
- View filter changes
- Dashboard layout changes
- Widget menu interactions

### State Requirements
- `SpaceState`: Complete space state (all objects)
- `ShipState`: All ship states
- `Tweakable` metadata: Property definitions
- Selection container: Multi-select state
- Interactive layer commands: Create/delete/modify
- Dashboard layout: GoldenLayout config

## Technical Constraints

- **GoldenLayout Dependency**: Uses older GoldenLayout v1 API
- **Widget Registration**: Async ship detection requires `for await` loop
- **LocalStorage Limits**: Large layouts may exceed storage quota
- **Performance**: Rendering 100+ blips + FOV overlays at 60 FPS
- **Alpha Filters**: Field-of-view uses PixiJS alpha filters (GPU intensive)
- **Selection Box**: Custom selection logic may have edge cases
- **Zoom Persistence**: Stored in component state, not centralized
- **Input Manager**: Must not interfere with ship-specific input managers
