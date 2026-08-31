---
audience: agent
depth: deep
source_of_truth:
    - modules/core/src/ship
last_verified: 2026-08-18
---

# Adding a ship system

How to add a subsystem to `ShipState` end to end — design state, runtime state, manager, and design config. Sibling notes: [widgets](extending-widgets.md), [space objects](extending-space-objects.md). The contract every system must satisfy is [`specs/SHIP_SYSTEMS_SPEC.md`](../specs/SHIP_SYSTEMS_SPEC.md); existing systems and their formulas are in [`SUBSYSTEMS.md`](../SUBSYSTEMS.md).

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
