---
audience: agent
depth: deep
source_of_truth:
    - modules/browser/src/widgets
    - modules/browser/src/screens/ship.ts
last_verified: 2026-08-18
---

# Adding a widget

How to build a dashboard widget, wire its controls, and register it on a screen. Sibling notes: [ship systems](extending-ship-systems.md), [space objects](extending-space-objects.md). Layout rules and widget contracts live in [`specs/WIDGET_SYSTEM_SPEC.md`](../specs/WIDGET_SYSTEM_SPEC.md).

### Widget Structure

**Basic Widget:**

```typescript
// modules/browser/src/widgets/my-widget.ts
import type { ShipDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function myWidget(shipDriver: ShipDriver): DashboardWidget {
    class MyComponent {
        constructor(container: WidgetContainer) {
            // Build UI into the widget's DOM element
            const el = container.getElement().get(0);
            el.innerHTML = `
                <h2>My Widget</h2>
                <div class="content">
                    <div class="value" id="value">0</div>
                </div>
            `;

            // Observe state changes through the driver's event bridge
            const valueEl = el.querySelector('#value');
            shipDriver.events.on('/reactor/energy', () => {
                if (valueEl) {
                    valueEl.textContent = shipDriver.state.reactor.energy.toString();
                }
            });
        }
    }
    return { name: 'my-widget', type: 'component', component: MyComponent, defaultProps: {} };
}
```

### Widget with Controls

**Interactive Widget:**

```typescript
export function powerControl(shipDriver: ShipDriver): DashboardWidget {
    class PowerControlComponent {
        constructor(container: WidgetContainer) {
            const el = container.getElement().get(0);

            // Create slider
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '1';
            slider.step = '0.01';
            slider.value = shipDriver.state.reactor.power.toString();

            // Send command on change
            slider.addEventListener('input', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value);
                shipDriver.sendJsonCmd('/reactor/power', value);
            });

            // Update slider when state changes
            shipDriver.events.on('/reactor/power', () => {
                slider.value = shipDriver.state.reactor.power.toString();
            });

            el.appendChild(slider);
        }
    }
    return { name: 'power-control', type: 'component', component: PowerControlComponent, defaultProps: {} };
}
```

### Widget with Tweakpane

**Advanced Controls:**

```typescript
import { createWidgetPane } from '../panel';

export function systemControl(shipDriver: ShipDriver): DashboardWidget {
    class SystemControlComponent {
        constructor(container: WidgetContainer) {
            const { pane } = createWidgetPane(container, 'System Control');

            // Add controls
            pane.addBinding(shipDriver.state.reactor, 'power', {
                min: 0,
                max: 1,
                step: 0.01,
            }).on('change', (ev) => {
                shipDriver.sendJsonCmd('/reactor/power', ev.value);
            });

            pane.addBinding(shipDriver.state.reactor, 'coolantFactor', {
                min: 0,
                max: 1,
                step: 0.01,
            }).on('change', (ev) => {
                shipDriver.sendJsonCmd('/reactor/coolantFactor', ev.value);
            });
        }
    }
    return { name: 'system-control', type: 'component', component: SystemControlComponent, defaultProps: {} };
}
```

### Widget Registration

**Register in dashboard:**

```typescript
// modules/browser/src/screens/ship.ts
import { myWidget } from '../widgets/my-widget';
import { powerControl } from '../widgets/power-control';

dashboard.registerWidget(myWidget(shipDriver));
dashboard.registerWidget(powerControl(shipDriver));
```

**Add to screen:**

```typescript
// modules/browser/src/screens/ship.ts
export const shipScreen = {
    content: [
        {
            type: 'row',
            content: [
                { type: 'component', componentName: 'my-widget' },
                { type: 'component', componentName: 'power-control' },
            ],
        },
    ],
};
```
