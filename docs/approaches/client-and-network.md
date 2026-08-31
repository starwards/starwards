# Client and network

Techniques on the wire and in the browser — connection lifecycle, driver layer, rendering and widget composition.

## Network & Client Management

1. **Connection Manager State Machine**
    - [`ConnectionManager`](../../modules/core/src/client/connection-manager.ts) handles reconnection
    - Typed [`ConnectionStateEvent`](../../modules/core/src/client/driver.ts) transitions
    - Exponential backoff for reconnects
    - Room lifecycle hooks

2. **Room Lifecycle Hooks**
    - [`hookRoomLifecycle`](../../modules/core/src/client/driver.ts) registers cleanup
    - Automatic room leave on disconnect
    - Error propagation to connection manager
    - [`onLeave`](../../modules/core/src/client/driver.ts) handlers

3. **Lazy Driver Initialization**
    - Drivers created on-demand via [`getShipDriver`](../../modules/core/src/client/driver.ts)
    - [`Promise<Driver>`](../../modules/core/src/client/driver.ts) caching
    - Wait for ship existence before connecting
    - Prevents premature connections

4. **Infinite Iterator Pattern**
    - [`getUniqueShipIds`](../../modules/core/src/client/driver.ts) async generator
    - Yields new ships as they appear
    - Tracks seen ships in Set
    - Runs until client destroyed

5. **Game State Change Observer**
    - [`onGameStateChange`](../../modules/core/src/client/driver.ts) callback registration
    - Automatic re-subscription on reconnect
    - Cleanup function returned
    - Error handling with silent catch

## UI & Browser Patterns

6. **Golden Layout for Docking**
    - [`golden-layout`](../../modules/browser/package.json) library
    - Draggable, resizable panels
    - Layout persistence to localStorage
    - Multi-monitor support

7. **Tweakpane Runtime Configuration**
    - [`tweakpane`](../../modules/browser/package.json) for debugging
    - [`@tweakable`](../../modules/core/src/tweakable.ts) decorator integration
    - Runtime value adjustment
    - Developer tools UI

8. **PixiJS Rendering**
    - [`pixi.js`](../../modules/browser/package.json) for 2D graphics
    - Layer-based rendering
    - Sprite pooling for performance
    - WebGL acceleration

9. **Arwes Sci-fi UI**
    - [`@arwes/react`](../../modules/browser/package.json) component library (version 1.0.0-next.25020502)
    - Consistent futuristic theme
    - Animation support
    - Sound effects integration

10. **React 18**
    - [`"jsx": "react"`](../../tsconfig.json) in tsconfig
    - No `import React` needed
    - Cleaner component files
    - Automatic JSX transform

11. **Hotkeys.js for Shortcuts**
    - [`hotkeys-js`](../../modules/browser/package.json) library
    - Global keyboard shortcuts
    - Context-aware bindings
    - Game controls

12. **WebFont Loader**
    - [`webfontloader`](../../modules/browser/package.json) for custom fonts
    - Async font loading
    - FOUT prevention
    - Loading state management

13. **CSS Element Queries**
    - [`css-element-queries`](../../modules/browser/package.json)
    - Container-based responsive design
    - Panel resize handling
    - Alternative to media queries

14. **D3 for Visualizations**
    - [`d3`](../../modules/browser/package.json) library
    - Data-driven graphics
    - Tactical displays
    - Chart generation
