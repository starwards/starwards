# Integration Guide - Starwards

**External integrations and custom extensions**

## Table of Contents

- [Node-RED Integration](#node-red-integration)
- [Docker Deployment](#docker-deployment)
- [MQTT Integration](#mqtt-integration)
- [Custom Widget Creation](#custom-widget-creation)
- [New Ship System Creation](#new-ship-system-creation)
- [Custom Space Objects](#custom-space-objects)

## Node-RED Integration

### Overview

Node-RED integration enables external control and monitoring of Starwards via visual programming flows.

**Use Cases:**
- Hardware integration (DMX lights, sound systems)
- Dashboard creation
- MQTT bridging
- Custom automation
- External displays

### Installation

**Install Node-RED:**
```bash
npm install -g node-red
```

**Install Starwards nodes:**
```bash
cd ~/.node-red
npm install @starwards/node-red
```

**Start Node-RED:**
```bash
node-red
```

**Access:** http://localhost:1880

### Available Nodes

#### starwards-config

**Purpose:** Connection configuration (shared across ship nodes)

**Configuration:**
- Server URL (e.g., `http://localhost:2567`)
- Ship ID

**Usage:**
1. Drag `starwards-config` to flow
2. Double-click to configure
3. Enter server URL and ship ID
4. Other nodes reference this config

#### ship-read

**Purpose:** Read ship state properties

**Configuration:**
- Config: Select starwards-config node
- Pattern: JSON Pointer pattern (e.g., `/reactor/energy`)

**Output:**
```javascript
{
    topic: "/reactor/energy",  // JSON Pointer path
    payload: 1000              // Current value
}
```

**Example Flow:**
```
[ship-read] → [debug]
```

**Pattern Matching:**
```
/reactor/energy          // Specific property
/reactor/*               // All reactor properties
/thrusters/*/active      // All thruster active states
```

#### ship-write

**Purpose:** Write ship state properties

**Configuration:**
- Config: Select starwards-config node

**Input:**
```javascript
{
    topic: "/reactor/power",   // JSON Pointer path
    payload: 0.5               // New value
}
```

**Example Flow:**
```
[inject] → [ship-write]
```

### Example Flows

#### Example 1: Energy Monitor

**Flow:**
```
[ship-read: /reactor/energy] → [gauge] → [dashboard]
```

**Configuration:**
1. Add `ship-read` node
2. Set pattern: `/reactor/energy`
3. Add gauge widget
4. Connect to dashboard

#### Example 2: Power Control

**Flow:**
```
[slider: 0-1] → [ship-write: /reactor/power]
```

**Configuration:**
1. Add slider (0-1 range)
2. Add `ship-write` node
3. Set topic in function node:
```javascript
msg.topic = "/reactor/power";
return msg;
```

#### Example 3: Alert System

**Flow:**
```
[ship-read: /armor/health] → [switch: <20] → [mqtt out: alerts/low-health]
```

**Configuration:**
1. Monitor armor health
2. Switch node: route if < 20
3. Publish to MQTT alert topic

#### Example 4: Multi-Ship Dashboard

**Flow:**
```
[ship-read: ship-1] → [dashboard: Ship 1]
[ship-read: ship-2] → [dashboard: Ship 2]
```

**Configuration:**
1. Create multiple config nodes (one per ship)
2. Create separate read nodes
3. Display on dashboard

### Connection Management

**Driver Lifecycle:**
```
Config Node Created
    ↓
Driver Initialized
    ↓
WebSocket Connection
    ↓
Room Join
    ↓
State Sync
    ↓
[Active - Nodes Operational]
    ↓
Disconnect/Error
    ↓
Auto-Reconnect (exponential backoff)
```

**Status Indicators:**
- 🟢 Green: Connected
- 🟡 Yellow: Connecting
- 🔴 Red: Disconnected/Error

### Error Handling

**Common Issues:**

**Connection Failed:**
```
Error: ECONNREFUSED
```
- Solution: Verify server is running
- Check server URL in config

**Invalid Ship ID:**
```
Error: Ship not found
```
- Solution: Verify ship exists in game
- Check ship ID spelling

**Invalid Path:**
```
Error: Invalid JSON Pointer
```
- Solution: Check path syntax
- Use `/property` format

### Advanced Usage

**Custom Processing:**
```javascript
// Function node
const energy = msg.payload;
const percentage = (energy / 1000) * 100;
msg.payload = percentage;
return msg;
```

**Conditional Logic:**
```javascript
// Switch node
if (msg.payload < 20) {
    return [msg, null];  // Route 1: Low
} else {
    return [null, msg];  // Route 2: Normal
}
```

**Aggregation:**
```javascript
// Join node
// Combine multiple ship states
const ships = msg.payload;
const totalEnergy = ships.reduce((sum, ship) => 
    sum + ship.reactor.energy, 0);
msg.payload = totalEnergy;
return msg;
```

## Docker Deployment

### Docker Compose Setup

**File:** [`docker/docker-compose.yml`](../docker/docker-compose.yml)

```yaml
version: '3.8'

services:
  mqtt:
    image: eclipse-mosquitto:1.6.10
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
      - ./mosquitto/log:/mosquitto/log

  node-red:
    image: nodered/node-red:3.0.2
    ports:
      - "1880:1880"
    volumes:
      - ./node-red-data:/data
    environment:
      - TZ=UTC
```

### Starting Services

**Start all services:**
```bash
cd docker
docker-compose up -d
```

**View logs:**
```bash
docker-compose logs -f
```

**Stop services:**
```bash
docker-compose down
```

### Service URLs

- **MQTT:** `mqtt://localhost:1883`
- **Node-RED:** http://localhost:1880

### Persistent Data

**Volumes:**
```
docker/
├── mosquitto/
│   ├── config/
│   ├── data/
│   └── log/
└── node-red-data/
```

**Backup:**
```bash
tar -czf backup.tar.gz docker/mosquitto docker/node-red-data
```

**Restore:**
```bash
tar -xzf backup.tar.gz
```

## MQTT Integration

### Overview

MQTT enables pub/sub messaging for external systems.

**Architecture:**
```
Starwards ↔ Node-RED ↔ MQTT Broker ↔ External Systems
```

### Setup

**1. Start MQTT broker:**
```bash
cd docker
docker-compose up -d mqtt
```

**2. Configure Node-RED:**
- Add MQTT broker node
- Host: `mqtt` (Docker) or `localhost`
- Port: `1883`

**3. Create bridge flow:**
```
[ship-read] → [mqtt out: starwards/ship1/energy]
[mqtt in: starwards/commands/#] → [ship-write]
```

### Topic Structure

**Recommended Pattern:**
```
starwards/
├── ship1/
│   ├── reactor/
│   │   ├── energy
│   │   └── power
│   ├── thrusters/
│   │   └── 0/active
│   └── status
├── ship2/
│   └── ...
└── commands/
    ├── ship1/
    │   └── reactor/power
    └── ship2/
        └── ...
```

### Example: DMX Light Control

**Flow:**
```
[ship-read: /armor/health] 
    → [function: calculate color]
    → [mqtt out: dmx/lights/ship1/color]
```

**Function Node:**
```javascript
const health = msg.payload;
let color;

if (health > 75) {
    color = "green";
} else if (health > 25) {
    color = "yellow";
} else {
    color = "red";
}

msg.payload = color;
msg.topic = "dmx/lights/ship1/color";
return msg;
```

### Example: Sound System

**Flow:**
```
[ship-read: /chainGun/isFiring]
    → [switch: true]
    → [mqtt out: audio/effects/gunfire]
```

## Custom Widget Creation

### Widget Structure

**Basic Widget:**
```typescript
// modules/browser/src/widgets/my-widget.ts
import { createWidget } from './create';
import type { ShipDriver } from '@starwards/core';

export const myWidget = createWidget({
    name: 'my-widget',
    render: (ship: ShipDriver) => {
        // Create container
        const container = document.createElement('div');
        container.className = 'my-widget';
        
        // Build UI
        container.innerHTML = `
            <h2>My Widget</h2>
            <div class="content">
                <div class="value" id="value">0</div>
            </div>
        `;
        
        // Update on state change
        const valueEl = container.querySelector('#value');
        ship.state.onChange(() => {
            if (valueEl) {
                valueEl.textContent = ship.state.reactor.energy.toString();
            }
        });
        
        // Listen to specific property
        ship.state.reactor.listen('energy', (value) => {
            if (valueEl) {
                valueEl.textContent = value.toString();
            }
        });
        
        return container;
    }
});
```

### Widget with Controls

**Interactive Widget:**
```typescript
export const powerControl = createWidget({
    name: 'power-control',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        
        // Create slider
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = ship.state.reactor.power.toString();
        
        // Update on change
        slider.addEventListener('input', (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            ship.room.send('/reactor/power', { value });
        });
        
        // Update slider when state changes
        ship.state.reactor.listen('power', (value) => {
            slider.value = value.toString();
        });
        
        container.appendChild(slider);
        return container;
    }
});
```

### Widget with Tweakpane

**Advanced Controls:**
```typescript
import { createPane } from '../panel';

export const systemControl = createWidget({
    name: 'system-control',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        const pane = createPane({ title: 'System Control', container });

        // Add controls
        pane.addInput(ship.state.reactor, 'power', {
            min: 0,
            max: 1,
            step: 0.01
        }).on('change', (ev) => {
            ship.room.send('/reactor/power', { value: ev.value });
        });

        pane.addInput(ship.state.reactor, 'coolantFactor', {
            min: 0,
            max: 1,
            step: 0.01
        }).on('change', (ev) => {
            ship.room.send('/reactor/coolantFactor', { value: ev.value });
        });

        return container;
    }
});
```

### Widget Registration

**Register in dashboard:**
```typescript
// modules/browser/src/widgets/dashboard.ts
import { myWidget } from './my-widget';
import { powerControl } from './power-control';

registerWidget(myWidget);
registerWidget(powerControl);
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
                { type: 'component', componentName: 'power-control' }
            ]
        }
    ]
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
                shield.strength + 
                shield.design.rechargeRate * 
                shield.efficiency * 
                deltaSeconds
            );
        }
    }
    
    absorbDamage(amount: number): number {
        const absorbed = Math.min(amount, this.state.shield.strength);
        this.state.shield.strength -= absorbed;
        return amount - absorbed;  // Remaining damage
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
import { createWidget } from './create';

export const shield = createWidget({
    name: 'shield',
    render: (ship) => {
        const container = document.createElement('div');
        container.className = 'shield-widget';
        
        container.innerHTML = `
            <h3>Shield</h3>
            <div class="shield-bar">
                <div class="shield-fill" id="shield-fill"></div>
            </div>
            <div class="shield-value" id="shield-value">0</div>
        `;
        
        const fill = container.querySelector('#shield-fill') as HTMLElement;
        const value = container.querySelector('#shield-value') as HTMLElement;
        
        ship.state.shield.listen('strength', (strength) => {
            const max = ship.state.shield.design.maxStrength;
            const percent = (strength / max) * 100;
            fill.style.width = `${percent}%`;
            value.textContent = `${Math.round(strength)} / ${max}`;
        });
        
        return container;
    }
});
```

**7. Add Configuration:**
```typescript
// modules/core/src/configurations/dragonfly-sf-22.ts
export const dragonflyConfig = {
    // ... other systems
    shield: {
        maxStrength: 1000,
        rechargeRate: 10,
        energyCost: 5,
        damage50: 50
    }
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
    armTime = 2;  // Seconds until armed
    
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
    Mine: Mine;  // Add new type
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
            this.Mine.get(id)  // Add to lookup
        );
    }
    
    public *maps(): IterableIterator<MapSchema> {
        yield this.Projectile;
        yield this.Explosion;
        yield this.Asteroid;
        yield this.Spaceship;
        yield this.Waypoint;
        yield this.Mine;  // Add to iteration
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
    graphics.beginFill(0xFF0000);
    graphics.drawCircle(0, 0, mine.radius);
    graphics.endFill();
    
    if (!mine.armed) {
        // Draw arming indicator
        graphics.lineStyle(1, 0xFFFF00);
        graphics.drawCircle(0, 0, mine.triggerRadius);
    }
}

// Add to renderer map
const renderers = {
    // ... existing renderers
    Mine: renderMine
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

## Related Documentation

- [LLM_CONTEXT.md](LLM_CONTEXT.md) - Quick-start guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [API_REFERENCE.md](API_REFERENCE.md) - API documentation
- [PATTERNS.md](PATTERNS.md) - Code patterns
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development workflows
- [CLAUDE.md](../CLAUDE.md) - Original developer guide
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines