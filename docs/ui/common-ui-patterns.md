---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/widgets
related:
  - ../UI_SPECIFICATION.md
  - specs/WIDGET_SYSTEM_SPEC.md
last_verified: 2026-08-18
---

# UI Architecture & Common Patterns — UI Specification

Shared architecture, panel/radar/input code patterns, and cross-screen technical constraints for the Starwards SBS UI. Per-screen widget inventories live under `docs/ui/` (see [`../UI_SPECIFICATION.md`](../UI_SPECIFICATION.md) for the index).

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
const { pane, cleanup } = createWidgetPane(container, 'Panel Title');
// the pane's element gets data-id="Panel Title" for E2E testing
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
const root = new CameraView(camera);
await root.initialize({ backgroundColor: radarFogOfWar }, container);
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
// cleanup runs when the container is destroyed; disposing the pane is already registered on it
const { pane, cleanup } = createWidgetPane(container, 'Panel');
cleanup.add(() => stopSomething());
```

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

## Glossary

- **Blip**: Visual representation of space object on radar
- **Colyseus**: Multiplayer game server framework
- **Defectible**: Individual component within a system that can be damaged
- **Driver**: Client-side wrapper for server state (ShipDriver, SpaceDriver)
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
