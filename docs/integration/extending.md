---
audience: agent
depth: deep
source_of_truth:
  - modules/browser/src/widgets
  - modules/browser/src/screens/ship.ts
  - modules/core/src/ship
  - modules/core/src/space
last_verified: 2026-08-18
---

# Extending Starwards: Widgets, Ship Systems, Space Objects

## Custom Widget Creation

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

## New Ship System Creation

### Complete System Example

**1. Create Design State:**

```typescript
// modules/core/src/ship/shield.ts
import { DesignState } from './system';
import { gameField } from '../game-field';

class ShieldDesignState extends DesignState {
    @gameField('float32') maxStrength = 1000;
    @gameField('float32') rechargeRate = 10;
    @gameField('float32') energyCost = 5;
    @gameField('float32') damage50 = 50;
}
```

**2. Create System State:**

```typescript
import { SystemState } from './system';
import { range } from '../range';
import { defectible } from './system';

export class Shield extends SystemState {
    readonly name = 'Shield';

    @gameField(ShieldDesignState)
    design = new ShieldDesignState();

    @gameField('float32')
    @range((t: Shield) => [0, t.design.maxStrength])
    strength = 1000;

    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 1, name: 'efficiency' })
    efficiency = 1;

    get broken(): boolean {
        return this.efficiency < 0.1;
    }
}
```

**3. Add to ShipState:**

```typescript
// modules/core/src/ship/ship-state.ts
import { Shield } from './shield';

export class ShipState extends Spaceship {
    @gameField(Shield)
    shield!: Shield;
}
```

**4. Create Manager:**

```typescript
// modules/core/src/ship/shield-manager.ts
import { ShipState } from './ship-state';
import { IterationData } from '../updateable';

export class ShieldManager {
    constructor(private state: ShipState) {}

    update({ deltaSeconds }: IterationData) {
        const shield = this.state.shield;

        // Recharge
        if (!shield.broken && shield.strength < shield.design.maxStrength) {
            shield.strength = Math.min(
                shield.design.maxStrength,
                shield.strength + shield.design.rechargeRate * shield.efficiency * deltaSeconds,
            );
        }
    }

    absorbDamage(amount: number): number {
        const absorbed = Math.min(amount, this.state.shield.strength);
        this.state.shield.strength -= absorbed;
        return amount - absorbed; // Remaining damage
    }
}
```

**5. Integrate with Ship Manager:**

```typescript
// modules/core/src/ship/ship-manager.ts
import { ShieldManager } from './shield-manager';

export class ShipManagerPc extends ShipManager {
    private shieldManager: ShieldManager;

    constructor(...) {
        super(...);
        this.shieldManager = new ShieldManager(this.state);
    }

    update(id: IterationData) {
        super.update(id);
        this.shieldManager.update(id);
    }

    // Use in damage handling
    protected handleDamage(amount: number) {
        const remaining = this.shieldManager.absorbDamage(amount);
        if (remaining > 0) {
            // Apply to armor/hull
            this.state.armor.health -= remaining;
        }
    }
}
```

**6. Create Widget:**

```typescript
// modules/browser/src/widgets/shield.ts
import { ShipDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function shieldWidget(shipDriver: ShipDriver): DashboardWidget {
    class ShieldComponent {
        constructor(container: WidgetContainer) {
            const el = container.getElement().get(0);
            el.innerHTML = `
                <h3>Shield</h3>
                <div class="shield-bar">
                    <div class="shield-fill" id="shield-fill"></div>
                </div>
                <div class="shield-value" id="shield-value">0</div>
            `;

            const fill = el.querySelector('#shield-fill') as HTMLElement;
            const value = el.querySelector('#shield-value') as HTMLElement;

            shipDriver.events.on('/shield/strength', () => {
                const strength = shipDriver.state.shield.strength;
                const max = shipDriver.state.shield.design.maxStrength;
                const percent = (strength / max) * 100;
                fill.style.width = `${percent}%`;
                value.textContent = `${Math.round(strength)} / ${max}`;
            });
        }
    }
    return { name: 'shield', type: 'component', component: ShieldComponent, defaultProps: {} };
}
```

**7. Add Configuration:**

```typescript
// modules/core/src/configurations/demo-ship.ts
export const demoShipConfig = {
    // ... other systems
    shield: {
        maxStrength: 1000,
        rechargeRate: 10,
        energyCost: 5,
        damage50: 50,
    },
};
```

## Custom Space Objects

### Creating New Object Type

**1. Define Object Class:**

```typescript
// modules/core/src/space/mine.ts
import { SpaceObjectBase } from './space-object-base';
import { gameField } from '../game-field';
import { Faction } from './faction';

export class Mine extends SpaceObjectBase {
    readonly type = 'Mine' as const;

    @gameField('int8')
    faction: Faction = Faction.NONE;

    @gameField('float32')
    damage = 100;

    @gameField('float32')
    triggerRadius = 5;

    @gameField('float32')
    armTime = 2; // Seconds until armed

    @gameField('boolean')
    armed = false;

    init(id: string, position: Vec2, faction: Faction): this {
        this.id = id;
        this.position = position;
        this.faction = faction;
        this.radius = 1;
        return this;
    }

    static isInstance(o: unknown): o is Mine {
        return (o as Mine)?.type === 'Mine';
    }
}
```

**2. Add to SpaceObjects Type:**

```typescript
// modules/core/src/space/index.ts
import { Mine } from './mine';

export type SpaceObjects = {
    Spaceship: Spaceship;
    Projectile: Projectile;
    Explosion: Explosion;
    Asteroid: Asteroid;
    Waypoint: Waypoint;
    Mine: Mine; // Add new type
};

export type SpaceObject = SpaceObjects[keyof SpaceObjects];
```

**3. Add to SpaceState:**

```typescript
// modules/core/src/space/space-state.ts
import { Mine } from './mine';

export class SpaceState extends Schema {
    @gameField({ map: Mine })
    private readonly Mine = new MapSchema<Mine>();

    public get(id: string): SpaceObject | undefined {
        return (
            this.Projectile.get(id) ??
            this.Asteroid.get(id) ??
            this.Spaceship.get(id) ??
            this.Explosion.get(id) ??
            this.Waypoint.get(id) ??
            this.Mine.get(id) // Add to lookup
        );
    }

    public *maps(): IterableIterator<MapSchema> {
        yield this.Projectile;
        yield this.Explosion;
        yield this.Asteroid;
        yield this.Spaceship;
        yield this.Waypoint;
        yield this.Mine; // Add to iteration
    }
}
```

**4. Add Collision Handling:**

```typescript
// modules/core/src/logic/space-manager.ts
private handleCollisions(deltaSeconds: number) {
    this.collisions.checkAll((response: SWResponse) => {
        const subject = this.collisionToState.get(response.a);
        const object = this.collisionToState.get(response.b);

        // Handle mine collisions
        if (Mine.isInstance(subject) && subject.armed) {
            if (Spaceship.isInstance(object)) {
                this.detonateMine(subject);
            }
        }

        // ... existing collision handling
    });
}

private detonateMine(mine: Mine) {
    const explosion = new Explosion();
    explosion.init(
        uniqueId('explosion'),
        mine.position.clone(),
        mine.damage / 100
    );
    this.insert(explosion);
    mine.destroyed = true;
}
```

**5. Add Blip Renderer:**

```typescript
// modules/browser/src/radar/blips/blip-renderer.ts
import { Mine } from '@starwards/core';

function renderMine(mine: Mine, graphics: Graphics) {
    graphics.beginFill(0xff0000);
    graphics.drawCircle(0, 0, mine.radius);
    graphics.endFill();

    if (!mine.armed) {
        // Draw arming indicator
        graphics.lineStyle(1, 0xffff00);
        graphics.drawCircle(0, 0, mine.triggerRadius);
    }
}

// Add to renderer map
const renderers = {
    // ... existing renderers
    Mine: renderMine,
};
```

**6. Add Creation Command:**

```typescript
// modules/core/src/space/space-commands.ts
export type CreateMineOrderArg = {
    position: XY;
    faction: Faction;
};

// In SpaceState
public createMineCommands = Array.of<CreateMineOrderArg>();

// In SpaceManager.update()
for (const cmd of this.state.createMineCommands) {
    const mine = new Mine().init(
        makeId(),
        Vec2.make(cmd.position),
        cmd.faction
    );
    this.insert(mine);
}
this.state.createMineCommands = [];
```
