---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/screens/weapons.ts
related:
  - ../UI_SPECIFICATION.md
  - ../ui/common-ui-patterns.md
  - ../design/stations/weapons.md
last_verified: 2026-08-18
---

# Weapons Screen — UI Specification

Implementation inventory for the Weapons screen: mounted widgets, source files, data bindings, and known pain points. For design intent and build status, see [`../design/stations/weapons.md`](../design/stations/weapons.md). For shared widget/panel patterns, see [`common-ui-patterns.md`](common-ui-patterns.md).

**File**: `modules/browser/src/screens/weapons.ts`
**URL**: `/weapons.html?ship={shipId}` (optional `?station=ID` to pin this tab's registry id). `?ship=` is a self-assignment *request* the server validates against the station registry (issue #2131) — the screen binds to whatever ship its own registry entry resolves to, which may differ (auto-assigned, or standby if rejected). See [`../testing/README.md`](../testing/README.md) and `modules/core/src/stations/`.
**Role**: Weapons officer - targeting and weapons control

## Overview
The Weapons screen provides tactical targeting, torpedo tube management, and ammunition tracking. Primary focus on engaging enemy targets and managing limited ammunition.

## Functional Elements

### 1. Tactical Radar (Center/Main)
- **Widget**: `drawTacticalRadar()` - PixiJS-based radar
- **Range**: Fixed 5000m
- **Features**:
  - Circular radar with fog-of-war
  - Field-of-view based on faction radar range
  - Azimuth circle with degree markings
  - Crosshairs for chain gun (if equipped)
  - Speed lines showing target velocity
  - Range indicators (5 rings at 1000m intervals)
  - Blips: all detected objects rendered in green (no per-faction coloring); projectiles and this ship's own shells rendered in the radar shell tint (orange, `0xff6600`)
  - Visual target highlighting
- **Data Source**: SpaceDriver (all space objects), ShipDriver (own ship, chain gun)
- **Interactions**: Read-only display, shows currently selected target

### 2. Tubes Status Panel (Top-Left)
- **Widget**: `drawTubesStatus()` - Tweakpane folders
- **Per Tube Display** (Tube 0, Tube 1, etc.):
  - `ammo to use`: Projectile type selected (text, read-only)
  - `ammo loaded`: Currently loaded projectile (text, read-only)
  - `loading`: Load progress slider (0-1, read-only)
  - `safety locked`: Toggle for that tube's fire safety (checkbox) — locked by default; auto-locks the instant the tube fires
  - `auto load`: Toggle for automatic reloading (checkbox)
- **Features**:
  - Each tube in separate folder (expanded by default)
  - Separators between tubes
  - Auto-load and safety can be toggled per tube
- **Keyboard**:
  - `C` key: Toggle auto-load on Tube 0
  - `V` key: Change projectile type on Tube 0
  - `1`, `2`, `3`, `4` keys: Toggle safety on Tube 0, 1, 2, 3 respectively (one dedicated key per tube index)
  - `X` key: Fire — ship-level command that launches every tube that is simultaneously loaded, unlocked, and able to bear; each tube that fires re-locks its own safety immediately
- **Data Source**: `/tubes/[index]/projectile`, `/tubes/[index]/loadedProjectile`, `/tubes/[index]/loading`, `/tubes/[index]/loadAmmo`, `/tubes/[index]/safetyLocked`, `/fireTubesCommand`

### 3. Ammunition Panel (Middle-Left)
- **Widget**: `drawAmmoStatus()` - Tweakpane panel
- **Projectile Types Shown**:
  - For each projectile type in `ammoTypes`:
    - Display name (e.g., "cannon shell", "blast cannon shell", "missile")
    - Count format: `{current} / {max}`
- **Data Source**: `/magazine/count_{type}`, `/magazine/max_{type}`, `/magazine/capacity`
- **Visual**: Text labels with current/max counts
- **Updates**: Real-time as ammunition is fired and reloaded

### 4. Systems Status Panel (Top-Right)
- **Widget**: `drawSystemsStatus()` - Compact table
- **Systems Shown**:
  - All tubes (`/tubes/*`)
  - Chain gun (`/chainGun`)
  - Magazine (`/magazine`)
  - Radar (`/radar`)
- **Columns**: Status, Power, Heat, Hacked
- **Data Source**: Filtered systems from `shipDriver.systems`

### 5. Targeting Panel (Middle-Right)
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

## User Workflows

### Primary Workflow: Target and Fire
1. Use **Targeting Panel** filters to narrow down targets (ship only, enemy only, short range)
2. Press `]` or `[` to cycle through valid targets
3. Check **Tactical Radar** to verify target position and range
4. Ensure **Tubes Status** shows loaded ammunition
5. Unlock the tubes to fire with their dedicated safety key (`1`, `2`, `3`, `4`)
6. Press `X` to fire — every loaded, unlocked tube launches at once, then re-locks itself
7. Watch **Ammunition Panel** to track remaining ammo
8. Wait for a tube to reload (monitor loading slider) and re-unlock it before firing again

### Secondary Workflow: Ammunition Management
1. Monitor **Ammunition Panel** for ammo counts
2. Check **Tubes Status → ammo to use** for current selection
3. Press `V` to cycle through available projectile types
4. Ensure **auto load** is enabled for automatic reloading
5. Coordinate with engineering to ensure magazine has power

### Tertiary Workflow: Multiple Tube Management
1. Unlock the tubes to fire this volley with their dedicated safety keys (e.g. `1` and `2` for a two-tube ship)
2. Press `X` to fire every unlocked, loaded tube at once — a locked tube never fires, so leaving a tube locked holds its rounds in reserve
3. Stagger reloads by disabling auto-load on some tubes
4. Save EMP/Nuclear rounds for high-value targets, keeping their tube locked until needed

## Current Pain Points

1. **Projectile Selection Hidden**: `V` key cycles projectile but no visual feedback of available types
2. **No Target Info**: Target ID shown but no type, faction, distance, or health
3. **Radar Range Fixed**: 5000m range may be too close or too far depending on situation
4. **No Fire Solution**: No lead indicator or time-to-target calculation
5. **Tube Cooldown**: Loading time shown but no estimated time to ready
6. **No Ammo Warnings**: No alert when running low on specific ammo type
7. **Filter Persistence**: Targeting filters don't persist across reloads

## Data Dependencies

### Real-time State (High Frequency)
- All space objects for radar (positions, factions, types)
- Current target ID
- Tube loading progress (0-1 per tube)
- Chain gun state (if equipped)

### Real-time State (Medium Frequency)
- Ammunition counts (changes on fire/reload)
- Tube loaded projectile type
- System status (power, heat, hacked)

### Low Frequency / Event-driven
- Target filters (ship only, enemy only, short range)
- Auto-load toggle per tube
- Projectile type selection per tube
- Fire command

### State Requirements
- `ShipState.tubes[]`: Array of tube states
- `ShipState.magazine`: Ammunition inventory
- `ShipState.weaponsTarget`: Targeting system state
- `ShipState.chainGun`: Chain gun state (optional)
- `SpaceState`: All space objects for targeting
- `Projectile designs`: Projectile type definitions

## Technical Constraints

- **Targeting Filter Logic**: Applied server-side when cycling targets
- **Projectile Enum**: Fixed set of projectile types in core module
- **Tube Count**: Variable by ship design (usually 1-4 tubes)
- **Magazine Capacity**: Limited total capacity shared across all ammo types
- **Fire Rate**: Server-side cooldown prevents spam firing
- **Radar Performance**: 60 FPS with 100+ objects (same as Pilot radar)
- **Chain Gun**: Not all ships have chain gun - UI must handle null
