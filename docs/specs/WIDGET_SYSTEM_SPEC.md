# Widget System Specification

@category: ui-framework
@stability: stable
@location: modules/browser/src/widgets

## Quick Reference

| Component | Purpose | Integration |
|-----------|---------|-------------|
| DashboardWidget | Widget interface | Defines widget contract |
| Dashboard | Widget manager | Golden Layout wrapper |
| createWidget | Widget factory | Simplifies widget creation |
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
@file: modules/browser/src/widgets/create.ts
@pattern: factory-function
@stability: stable

-> simplifies: widget-creation
-> provides: common-structure
-> integrates: tweakpane
:: factory-pattern

## createWidget Function
```typescript
function createWidget(config: {
    name: string;
    render: (driver: ShipDriver) => HTMLElement;
}): DashboardWidget
```

### Basic Widget
```typescript
import { createWidget } from './create';

export const myWidget = createWidget({
    name: 'my-widget',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        container.innerHTML = '<h1>My Widget</h1>';
        return container;
    }
});
```

### Widget with State Updates
```typescript
export const statusWidget = createWidget({
    name: 'status',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        const statusDiv = document.createElement('div');
        container.appendChild(statusDiv);
        
        // Update on state change
        ship.state.onChange(() => {
            statusDiv.textContent = `Energy: ${ship.state.reactor.energy}`;
        });
        
        return container;
    }
});
```

### Widget with Tweakpane
```typescript
import { createPane } from '../panel';

export const controlWidget = createWidget({
    name: 'controls',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        // Use createPane() for automatic data-id attribute (enables semantic testing)
        const pane = createPane({ title: 'Controls', container });

        // Add controls
        pane.addInput(ship.state.reactor, 'power', {
            min: 0,
            max: 1,
            step: 0.25
        });

        return container;
    }
});
```

**Note**: Always use `createPane({ title: 'Panel Name', container })` instead of `new Pane({ container })`. This automatically adds `data-id="Panel Name"` for semantic testing via `page.locator('[data-id="Panel Name"]')`.


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
export const stateWidget = createWidget({
    name: 'state-widget',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        
        // Listen to specific property
        ship.state.reactor.listen('energy', (value) => {
            updateDisplay(value);
        });
        
        // Listen to entire state
        ship.state.onChange(() => {
            updateAllDisplays();
        });
        
        return container;
    }
});
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

export const controlPanel = createWidget({
    name: 'controls',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        const pane = createPane({ title: 'Controls', container });

        // Number input
        pane.addInput(ship.state.reactor, 'power', {
            min: 0,
            max: 1,
            step: 0.25
        });

        // Boolean toggle
        pane.addInput(ship.state, 'freeze', {
            label: 'Freeze'
        });

        // Button
        pane.addButton({ title: 'Fire' })
            .on('click', () => ship.fire());

        return container;
    }
});
```

## Folder Organization
```typescript
const pane = createPane({ title: 'Systems', container });

// Create folders
const reactorFolder = pane.addFolder({ title: 'Reactor' });
reactorFolder.addInput(ship.state.reactor, 'power');
reactorFolder.addInput(ship.state.reactor, 'energy');

const thrustersFolder = pane.addFolder({ title: 'Thrusters' });
for (const thruster of ship.state.thrusters) {
    thrustersFolder.addInput(thruster, 'power');
}
```

## Monitor Display
```typescript
// Read-only display
pane.addMonitor(ship.state.reactor, 'energy', {
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
import { createWidget } from './create';
import { ShipDriver } from '@starwards/core/client';

export const myWidget = createWidget({
    name: 'my-widget',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        container.className = 'my-widget';
        
        // Build UI
        const title = document.createElement('h2');
        title.textContent = 'My Widget';
        container.appendChild(title);
        
        const content = document.createElement('div');
        content.className = 'content';
        container.appendChild(content);
        
        // Update on state change
        ship.state.onChange(() => {
            updateContent(content, ship.state);
        });
        
        return container;
    }
});

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
export const displayWidget = createWidget({
    name: 'display',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        const display = document.createElement('div');
        container.appendChild(display);
        
        function update() {
            display.innerHTML = formatData(ship.state);
        }
        
        ship.state.onChange(update);
        update();
        
        return container;
    }
});
```

## Control Widget Pattern
@purpose: user-input

```typescript
import { createPane } from '../panel';

export const controlWidget = createWidget({
    name: 'controls',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        const pane = createPane({ title: 'Controls', container });

        // Add controls
        pane.addInput(ship.state.reactor, 'power', {
            min: 0,
            max: 1
        }).on('change', (ev) => {
            ship.setPower('reactor', ev.value);
        });

        return container;
    }
});
```

## Canvas Widget Pattern
@purpose: graphics-rendering

```typescript
export const canvasWidget = createWidget({
    name: 'canvas',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        container.appendChild(canvas);
        
        const ctx = canvas.getContext('2d')!;
        
        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawContent(ctx, ship.state);
            requestAnimationFrame(render);
        }
        
        render();
        return container;
    }
});
```

## React Widget Pattern
@purpose: react-components

```typescript
import React from 'react';
import { ShipDriver } from '@starwards/core/client';

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
✓ Use createWidget for simple widgets
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
import { createWidget } from './create';
import { ShipDriver } from '@starwards/core/client';

export const myWidget = createWidget({
    name: 'my-widget',
    render: (ship: ShipDriver) => {
        // Create container
        const container = document.createElement('div');
        container.className = 'my-widget';
        
        // Build UI
        const content = document.createElement('div');
        container.appendChild(content);
        
        // Update function
        function update() {
            content.innerHTML = formatData(ship.state);
        }
        
        // Listen to changes
        ship.state.onChange(update);
        
        // Initial render
        update();
        
        // Cleanup
        container.addEventListener('destroy', () => {
            // Remove listeners
        });
        
        return container;
    }
});

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