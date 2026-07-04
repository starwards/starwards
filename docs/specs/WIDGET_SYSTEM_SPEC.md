---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/widgets
related:
  - ../UI_SPECIFICATION.md
last_verified: 2026-06-13
---

# Widget System Specification

@category: ui-framework
@stability: stable
@location: modules/browser/src/widgets

## Quick Reference

| Component | Purpose | Integration |
|-----------|---------|-------------|
| DashboardWidget | Widget interface | Defines widget contract |
| Dashboard | Widget manager | Golden Layout wrapper |
| createWidget | GM "Create Objects" panel factory | Builds the object-creation GM widget |
| registerWidget | Registration | Adds widget to dashboard |

---

# Widget Interface Contract
@file: modules/browser/src/widgets/dashboard.ts
@pattern: interface-definition
@stability: stable

-> defines: widget-structure
-> integrates: golden-layout
-> supports: react-and-vanilla
:: interface

## DashboardWidget Interface
```typescript
interface DashboardWidget<T = Record<string, unknown>> {
    name: string;
    type: 'component' | 'react-component';
    component: GLComponent<T> | ComponentType<T & ReactProps>;
    defaultProps: Partial<T>;
    makeHeaders?: MakeHeaders<T>;
}
```

### Properties

#### name
@property: widget-identifier
@type: string
@required: true

```typescript
name: 'tactical-radar'
name: 'system-status'
name: 'damage-report'
```

#### type
@property: component-type
@type: 'component' | 'react-component'
@required: true

```typescript
// Vanilla JS component
type: 'component'

// React component
type: 'react-component'
```

#### component
@property: component-class
@required: true

```typescript
// Vanilla JS component
component: class MyWidget {
    constructor(container: Container, state: T) {
        // Initialize widget
    }
}

// React component
component: (props: T & ReactProps) => JSX.Element
```

#### defaultProps
@property: default-configuration
@type: Partial<T>
@required: true

```typescript
defaultProps: {
    width: 800,
    height: 600,
    showGrid: true
}
```

#### makeHeaders
@property: custom-headers
@type: MakeHeaders<T>
@optional: true

```typescript
makeHeaders: (container: Container, state: T) => {
    const button = $('<button>Action</button>');
    button.on('click', () => handleAction());
    return [button];
}
```

---

# Dashboard Registration
@file: modules/browser/src/widgets/dashboard.ts
@pattern: widget-management
@stability: stable

-> extends: GoldenLayout
-> manages: widget-lifecycle
-> handles: layout-persistence
:: class

## Dashboard Class
```typescript
class Dashboard extends GoldenLayout {
    private widgets: Array<DashboardWidget> = [];
    
    constructor(
        configuration: GoldenLayout.Config,
        container: JQuery,
        dragContainer: JQuery<HTMLElement> | null
    )
}
```

## Registration Method
```typescript
public registerWidget<T>(
    widget: DashboardWidget<T>,
    props: Partial<T> = {},
    name?: string
): void
```

### Usage
```typescript
const dashboard = new Dashboard(config, container, dragContainer);

// Register widget
dashboard.registerWidget(myWidget);

// Register with custom props
dashboard.registerWidget(myWidget, { customProp: 'value' });

// Register with custom name
dashboard.registerWidget(myWidget, {}, 'custom-name');

// Setup dashboard
dashboard.setup();
```

---

# Widget Creation Pattern
@file: modules/browser/src/widgets/ammo.ts
@pattern: factory-function
@stability: stable

-> provides: common-structure
-> integrates: tweakpane
:: factory-pattern

## The Widget Factory Function

Each widget file exports a factory function that takes a `ShipDriver` and returns a
`DashboardWidget`. The factory defines a local component class (its constructor receives
`(container, props)`) and returns `{ name, type: 'component', component, defaultProps: {} }`.

### Basic Widget
```typescript
import { ShipDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function myWidget(shipDriver: ShipDriver): DashboardWidget {
    class MyComponent {
        constructor(container: WidgetContainer, _: unknown) {
            container.getElement().get(0).innerHTML = '<h1>My Widget</h1>';
        }
    }
    return {
        name: 'my-widget',
        type: 'component',
        component: MyComponent,
        defaultProps: {},
    };
}
```

### Widget with State Updates
```typescript
export function statusWidget(shipDriver: ShipDriver): DashboardWidget {
    class StatusComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const statusDiv = document.createElement('div');
            container.getElement().get(0).appendChild(statusDiv);

            // Update on state change
            shipDriver.state.onChange(() => {
                statusDiv.textContent = `Energy: ${shipDriver.state.reactor.energy}`;
            });
        }
    }
    return {
        name: 'status',
        type: 'component',
        component: StatusComponent,
        defaultProps: {},
    };
}
```

### Widget with Tweakpane
```typescript
import { createPane } from '../panel';

export function controlWidget(shipDriver: ShipDriver): DashboardWidget {
    class ControlComponent {
        constructor(container: WidgetContainer, _: unknown) {
            // Use createPane() for automatic data-id attribute (enables semantic testing)
            const pane = createPane({ title: 'Controls', container: container.getElement().get(0) });

            // Add controls
            pane.addBinding(shipDriver.state.reactor, 'power', {
                min: 0,
                max: 1,
                step: 0.25,
            });
        }
    }
    return {
        name: 'controls',
        type: 'component',
        component: ControlComponent,
        defaultProps: {},
    };
}
```

**Note**: Always use `createPane({ title: 'Panel Name', container })` instead of `new Pane({ container })`. This automatically adds `data-id="Panel Name"` for semantic testing via `page.locator('[data-id="Panel Name"]')`.

## createWidget (GM "Create Objects" panel)
@file: modules/browser/src/widgets/create.ts

`createWidget` in `create.ts` is not a generic factory — it builds one specific GM widget
(the "Create Objects" panel, `name: 'create'`) and takes an `InteractiveLayerCommands`
object used to spawn asteroids, ships, explosions and waypoints:

```typescript
function createWidget(createContainer: InteractiveLayerCommands): DashboardWidget
```


---

# Props and State Management
@pattern: data-flow
@stability: stable

## Props Pattern
```typescript
interface MyWidgetProps {
    width: number;
    height: number;
    showGrid: boolean;
}

export const myWidget: DashboardWidget<MyWidgetProps> = {
    name: 'my-widget',
    type: 'component',
    component: class MyWidget {
        constructor(
            private container: Container,
            private props: MyWidgetProps
        ) {
            this.render();
        }
        
        private render() {
            const { width, height, showGrid } = this.props;
            // Use props
        }
    },
    defaultProps: {
        width: 800,
        height: 600,
        showGrid: true
    }
};
```

## State Management
```typescript
export function stateWidget(shipDriver: ShipDriver): DashboardWidget {
    class StateComponent {
        constructor(container: WidgetContainer, _: unknown) {
            // Listen to specific property
            shipDriver.state.reactor.listen('energy', (value) => {
                updateDisplay(value);
            });

            // Listen to entire state
            shipDriver.state.onChange(() => {
                updateAllDisplays();
            });
        }
    }
    return {
        name: 'state-widget',
        type: 'component',
        component: StateComponent,
        defaultProps: {},
    };
}
```

---

# Golden Layout Integration
@framework: golden-layout
@version: 1.x
@stability: stable

-> provides: dockable-panels
-> supports: drag-and-drop
-> persists: layout-state
:: framework-integration

## Layout Configuration
```typescript
const config: GoldenLayout.Config = {
    content: [{
        type: 'row',
        content: [{
            type: 'component',
            componentName: 'tactical-radar',
            width: 70
        }, {
            type: 'column',
            content: [{
                type: 'component',
                componentName: 'system-status'
            }, {
                type: 'component',
                componentName: 'damage-report'
            }]
        }]
    }]
};
```

## Dashboard Setup
```typescript
// Create dashboard
const dashboard = new Dashboard(
    config,
    $('#dashboard-container'),
    $('#widget-menu')
);

// Register widgets
dashboard.registerWidget(tacticalRadar);
dashboard.registerWidget(systemStatus);
dashboard.registerWidget(damageReport);

// Initialize
dashboard.setup();
```

## Drag Source
```typescript
// Automatically created for each widget
// Allows dragging from widget menu to dashboard
dashboard.createDragSource(menuItem, itemConfig);
```

---

# Tweakpane Integration
@library: tweakpane
@purpose: ui-controls
@stability: stable

-> provides: input-controls
-> generates: ui-automatically
-> integrates: with-state
:: library-integration

## Basic Tweakpane Usage
```typescript
import { createPane } from '../panel';

export function controlPanel(shipDriver: ShipDriver): DashboardWidget {
    class ControlPanelComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const pane = createPane({ title: 'Controls', container: container.getElement().get(0) });

            // Number input
            pane.addBinding(shipDriver.state.reactor, 'power', {
                min: 0,
                max: 1,
                step: 0.25,
            });

            // Boolean toggle
            pane.addBinding(shipDriver.state, 'freeze', {
                label: 'Freeze',
            });

            // Button
            pane.addButton({ title: 'Fire' }).on('click', () => shipDriver.fire());
        }
    }
    return {
        name: 'controls',
        type: 'component',
        component: ControlPanelComponent,
        defaultProps: {},
    };
}
```

## Folder Organization
```typescript
const pane = createPane({ title: 'Systems', container });

// Create folders
const reactorFolder = pane.addFolder({ title: 'Reactor' });
reactorFolder.addBinding(ship.state.reactor, 'power');
reactorFolder.addBinding(ship.state.reactor, 'energy');

const thrustersFolder = pane.addFolder({ title: 'Thrusters' });
for (const thruster of ship.state.thrusters) {
    thrustersFolder.addBinding(thruster, 'power');
}
```

## Monitor Display
```typescript
// Read-only display
pane.addBinding(ship.state.reactor, 'energy', {
    readonly: true,
    view: 'graph',
    min: 0,
    max: 10000
});
```

---

# Creating New Widgets

## Step-by-Step Guide

### 1. Create Widget File
```typescript
// modules/browser/src/widgets/my-widget.ts
import { ShipDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function myWidget(shipDriver: ShipDriver): DashboardWidget {
    class MyComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const root = container.getElement().get(0);
            root.className = 'my-widget';

            // Build UI
            const title = document.createElement('h2');
            title.textContent = 'My Widget';
            root.appendChild(title);

            const content = document.createElement('div');
            content.className = 'content';
            root.appendChild(content);

            // Update on state change
            shipDriver.state.onChange(() => {
                updateContent(content, shipDriver.state);
            });
        }
    }
    return {
        name: 'my-widget',
        type: 'component',
        component: MyComponent,
        defaultProps: {},
    };
}

function updateContent(element: HTMLElement, state: ShipState) {
    element.innerHTML = `
        <div>Energy: ${state.reactor.energy.toFixed(0)}</div>
        <div>Power: ${(state.reactor.power * 100).toFixed(0)}%</div>
    `;
}
```

### 2. Add Styles (Optional)
```css
/* modules/browser/src/widgets/my-widget.css */
.my-widget {
    padding: 10px;
    background: #1a1a1a;
    color: #00ff00;
}

.my-widget h2 {
    margin: 0 0 10px 0;
    font-size: 18px;
}

.my-widget .content {
    font-family: monospace;
}
```

### 3. Register Widget
```typescript
// modules/browser/src/screens/ship.ts
import { myWidget } from '../widgets/my-widget';

// Register in dashboard
dashboard.registerWidget(myWidget);
```

### 4. Add to Layout
```typescript
// Add to Golden Layout config
const config: GoldenLayout.Config = {
    content: [{
        type: 'row',
        content: [{
            type: 'component',
            componentName: 'my-widget',
            width: 50
        }]
    }]
};
```

---

# Widget Patterns

## Display Widget Pattern
@purpose: read-only-display

```typescript
export function displayWidget(shipDriver: ShipDriver): DashboardWidget {
    class DisplayComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const display = document.createElement('div');
            container.getElement().get(0).appendChild(display);

            function update() {
                display.innerHTML = formatData(shipDriver.state);
            }

            shipDriver.state.onChange(update);
            update();
        }
    }
    return {
        name: 'display',
        type: 'component',
        component: DisplayComponent,
        defaultProps: {},
    };
}
```

## Control Widget Pattern
@purpose: user-input

```typescript
import { createPane } from '../panel';

export function controlWidget(shipDriver: ShipDriver): DashboardWidget {
    class ControlComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const pane = createPane({ title: 'Controls', container: container.getElement().get(0) });

            // Add controls
            pane.addBinding(shipDriver.state.reactor, 'power', {
                min: 0,
                max: 1,
            }).on('change', (ev) => {
                shipDriver.setPower('reactor', ev.value);
            });
        }
    }
    return {
        name: 'controls',
        type: 'component',
        component: ControlComponent,
        defaultProps: {},
    };
}
```

## Canvas Widget Pattern
@purpose: graphics-rendering

```typescript
export function canvasWidget(shipDriver: ShipDriver): DashboardWidget {
    class CanvasComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 600;
            container.getElement().get(0).appendChild(canvas);

            const ctx = canvas.getContext('2d')!;

            function render() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawContent(ctx, shipDriver.state);
                requestAnimationFrame(render);
            }

            render();
        }
    }
    return {
        name: 'canvas',
        type: 'component',
        component: CanvasComponent,
        defaultProps: {},
    };
}
```

## React Widget Pattern
@purpose: react-components

```typescript
import React from 'react';
import { ShipDriver } from '@starwards/core';

interface MyReactWidgetProps {
    ship: ShipDriver;
}

const MyReactWidget: React.FC<MyReactWidgetProps> = ({ ship }) => {
    const [energy, setEnergy] = React.useState(0);
    
    React.useEffect(() => {
        const listener = ship.state.reactor.listen('energy', setEnergy);
        return () => listener();
    }, [ship]);
    
    return (
        <div>
            <h2>Energy: {energy.toFixed(0)}</h2>
        </div>
    );
};

export const myReactWidget: DashboardWidget<MyReactWidgetProps> = {
    name: 'my-react-widget',
    type: 'react-component',
    component: MyReactWidget,
    defaultProps: {}
};
```

---

# Widget Lifecycle

## Creation
```typescript
// Widget created when added to layout
dashboard.registerWidget(myWidget);
```

## Initialization
```typescript
// Component constructor called
class MyWidget {
    constructor(container: Container, props: Props) {
        this.initialize();
    }
}
```

## Updates
```typescript
// Listen to state changes
ship.state.onChange(() => {
    this.update();
});
```

## Cleanup
```typescript
// Golden Layout handles cleanup
// Remove event listeners in component
container.on('destroy', () => {
    this.cleanup();
});
```

---

# Custom Headers
@feature: widget-headers
@location: stack-header

## makeHeaders Function
```typescript
makeHeaders: (container: Container, state: Props) => {
    const buttons: JQuery<HTMLElement>[] = [];
    
    // Add button
    const refreshButton = $('<button>Refresh</button>');
    refreshButton.on('click', () => refresh());
    buttons.push(refreshButton);
    
    // Add toggle
    const toggle = $('<input type="checkbox">');
    toggle.on('change', (e) => handleToggle(e.target.checked));
    buttons.push(toggle);
    
    return buttons;
}
```

## Usage
```typescript
export const myWidget: DashboardWidget = {
    name: 'my-widget',
    type: 'component',
    component: MyWidgetClass,
    defaultProps: {},
    makeHeaders: (container, state) => {
        const button = $('<button>Action</button>');
        button.on('click', () => performAction());
        return [button];
    }
};
```

---

# Best Practices

## DO
✓ Export a `xWidget(shipDriver): DashboardWidget` factory per widget
✓ Listen to state changes for updates
✓ Clean up event listeners on destroy
✓ Use Tweakpane for controls
✓ Provide meaningful widget names
✓ Set appropriate defaultProps
✓ Use CSS for styling
✓ Handle errors gracefully

## DON'T
✗ Modify state directly from widgets
✗ Create memory leaks with listeners
✗ Skip error handling
✗ Use inline styles excessively
✗ Forget to update on state changes
✗ Create widgets without cleanup
✗ Bypass command system for updates
✗ Ignore Golden Layout lifecycle

---

# Template: New Widget

```typescript
// 1. Create widget file
// modules/browser/src/widgets/my-widget.ts
import { ShipDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function myWidget(shipDriver: ShipDriver): DashboardWidget {
    class MyComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const root = container.getElement().get(0);
            root.className = 'my-widget';

            // Build UI
            const content = document.createElement('div');
            root.appendChild(content);

            // Update function
            function update() {
                content.innerHTML = formatData(shipDriver.state);
            }

            // Listen to changes
            shipDriver.state.onChange(update);

            // Initial render
            update();

            // Cleanup
            container.on('destroy', () => {
                // Remove listeners
            });
        }
    }
    return {
        name: 'my-widget',
        type: 'component',
        component: MyComponent,
        defaultProps: {},
    };
}

// 2. Register widget
// modules/browser/src/screens/ship.ts
import { myWidget } from '../widgets/my-widget';
dashboard.registerWidget(myWidget);

// 3. Add to layout config
const config = {
    content: [{
        type: 'component',
        componentName: 'my-widget'
    }]
};
```

---

# Related Specifications

-> see: [STATE_MANAGEMENT_SPEC.md](STATE_MANAGEMENT_SPEC.md)
-> see: [COMMAND_SYSTEM_SPEC.md](COMMAND_SYSTEM_SPEC.md)
-> see: [SHIP_SYSTEMS_SPEC.md](SHIP_SYSTEMS_SPEC.md)