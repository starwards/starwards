---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/screens/input.ts
related:
  - ../UI_SPECIFICATION.md
  - ../ui/common-ui-patterns.md
last_verified: 2026-08-18
---

# Input Screen — UI Specification

Implementation inventory for the Input screen: mounted widgets, source files, data bindings, and known pain points. There is no `docs/design/stations/` counterpart for this screen — it is a standalone gamepad-testing tool, not a station. For shared widget/panel patterns, see [`common-ui-patterns.md`](common-ui-patterns.md).

**File**: `modules/browser/src/screens/input.ts`
**URL**: `/input.html`
**Role**: Gamepad testing and input debugging

## Overview
The Input screen provides real-time visualization of gamepad inputs. Used for testing gamepad compatibility, debugging input mappings, and understanding gamepad layouts. Based on @maulingmonkey/gamepad library demo.

## Functional Elements

### 1. Configuration Checkboxes (Top)
- **Dead Zone**: Apply 0.15 dead zone to axes (prevents drift)
- **Standardize**: Remap to standard gamepad layout
- **Keep Non-Standard**: Show non-standard gamepads
- **Keep Inactive**: Show disconnected gamepads

### 2. Gamepad Metadata Table
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

### 3. Gamepad Buttons Table
- **Columns**:
  - Name: Gamepad name
  - Index: Gamepad index
  - Buttons (0-37): 38 button columns with live values
- **Data Source**: `gamepad.buttons[]`
- **Visual**: Background color indicates press (cyan=not pressed, red=pressed)
- **Values**: Button pressure (0.00-1.00)

### 4. Events Log Table
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

## User Workflows

### Primary Workflow: Gamepad Testing
1. Connect gamepad to computer
2. Open `/input.html`
3. Check **Gamepad Metadata Table** for detection
4. Press buttons - verify in **Buttons Table**
5. Move sticks/triggers - verify in **Axes Table**
6. Check **Events Log** for event stream

### Secondary Workflow: Input Mapping
1. Enable **Dead Zone** if analog stick drifts
2. Enable **Standardize** to test standard layout
3. Move specific axis - note which index lights up
4. Press specific button - note which index lights up
5. Cross-reference with `input-config.ts` mappings
6. Update mappings if indexes don't match

### Tertiary Workflow: Debugging Input Issues
1. User reports "rotation doesn't work"
2. Open input screen
3. Move right stick - verify axis 0 lights up
4. Check **Events Log** for axis-value events
5. Verify dead zone is not too aggressive
6. Check gamepad mapping is "standard"

## Current Pain Points

1. **No Ship Context**: Can't test gamepad with actual ship - separate screen
2. **No Action Mapping**: Shows raw indices - doesn't map to game actions
3. **Overwhelming Data**: 11 axes + 38 buttons = information overload
4. **No Visualization**: Tables only - no visual gamepad diagram
5. **Event Flood**: Axis-value events spam the log
6. **No Recording**: Can't save input session for later analysis
7. **No Comparison**: Can't compare two gamepads side-by-side
8. **No Calibration**: Can't recalibrate dead zones or invert axes

## Data Dependencies

### Real-time State (High Frequency)
- `navigator.getGamepads()`: Array of connected gamepads
- Gamepad axes (11 per gamepad, polled 60 Hz)
- Gamepad buttons (38 per gamepad, polled 60 Hz)

### Real-time State (Low Frequency)
- Gamepad connection events
- Gamepad disconnection events

### Static Data
- Configuration flags (dead zone, standardize, etc.)
- Event history buffer (last 20 events)
- Gamepad metadata (vendor, product, name)

### State Requirements
- Browser Gamepad API support
- @maulingmonkey/gamepad library
- D3.js for table rendering and updates

## Technical Constraints

- **Browser Compatibility**: Gamepad API varies by browser
- **Gamepad Layout**: "standard" mapping not universal
- **Polling Required**: No native events for axis changes
- **Button Count**: 38 buttons may exceed physical buttons (padded)
- **Axis Count**: 11 axes may exceed physical axes (padded)
- **Dead Zone Math**: Applied in library, not configurable per-axis
- **Event Rate**: High frequency events can lag UI
- **No Ship State**: Completely isolated from game state
