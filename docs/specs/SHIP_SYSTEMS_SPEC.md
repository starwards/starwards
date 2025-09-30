# Ship Systems Specification

@category: game-mechanics
@stability: stable
@location: modules/core/src/ship

## Quick Reference

| System | Purpose | Key Properties | Manager |
|--------|---------|----------------|---------|
| Reactor | Energy generation | energy, power | EnergyManager |
| Thruster | Propulsion | thrust, turn | ThrustManager |
| Radar | Detection | range, contacts | RadarManager |
| ChainGun | Weapons | ammo, fireRate | WeaponsManager |
| Warp | FTL travel | level, charging | WarpManager |

---

# SystemState Base Class
@file: modules/core/src/ship/system.ts
@pattern: abstract-base-class
@stability: stable

-> extends: Schema
-> requires: @gameField decorators
-> implements: system-contract
:: abstract-class

## Contract Requirements

### Required Properties
```typescript
abstract class SystemState extends Schema {
    // Required abstract properties
    abstract readonly name: string;
    abstract readonly design: DesignState;
    abstract readonly broken: boolean;
    
    // Standard properties (inherited)
    @gameField('float32')
    energyPerMinute: number = 0;
    
    @range([0, MAX_SYSTEM_HEAT])
    @gameField('float32')
    heat: number = 0;
    
    @range([0, 1])
    @gameField('float32')
    coolantFactor: number = 0;
    
    @range([0, 1])
    @gameField('float32')
    power: number = PowerLevel.MAX;
    
    @range([0, 1])
    @gameField('float32')
    hacked: number = HackLevel.OK;
    
    // Computed property
    get effectiveness(): number {
        return this.broken ? 0 : this.power * this.hacked;
    }
}
```

### Required Methods
```typescript
// None - all behavior in managers
```

## Standard Properties

### Power
@property: power
@range: [0, 1]
@type: PowerLevel enum

```typescript
enum PowerLevel {
    SHUTDOWN = 0,
    LOW = 0.25,
    MID = 0.5,
    HIGH = 0.75,
    MAX = 1
}
```

**Usage:**
```typescript
system.power = PowerLevel.HIGH;  // 0.75
system.power = 0.5;              // MID
```

### Heat
@property: heat
@range: [0, MAX_SYSTEM_HEAT]
@default: 0

```typescript
const MAX_SYSTEM_HEAT = 100;

// Heat accumulation
system.heat += heatGenerated * deltaSeconds;

// Heat dissipation
system.heat -= coolantRate * system.coolantFactor * deltaSeconds;
```

### Effectiveness
@property: effectiveness
@computed: true
@formula: broken ? 0 : power * hacked

```typescript
get effectiveness(): number {
    return this.broken ? 0 : this.power * this.hacked;
}

// Usage
const actualThrust = maxThrust * system.effectiveness;
```

### Broken
@property: broken
@readonly: true
@computed: from defectibles

```typescript
// Automatically set by damage system
// true when system is disabled
// false when operational
```

---

# DesignState Base Class
@file: modules/core/src/ship/system.ts
@pattern: configuration-container
@stability: stable

-> extends: Schema
-> contains: system-configuration
-> immutable: at-runtime
:: abstract-class

## Purpose
Stores system design parameters (max values, rates, etc.)

## Structure
```typescript
abstract class DesignState extends Schema {
    keys() {
        return Object.keys(this.$changes.indexes);
    }
}
```

## Usage Pattern
```typescript
class ReactorDesignState extends DesignState {
    @gameField('float32')
    maxEnergy: number = 10000;
    
    @gameField('float32')
    energyPerSecond: number = 100;
}

class Reactor extends SystemState {
    @gameField(ReactorDesignState)
    design = new ReactorDesignState();
    
    // Use design values
    get maxEnergy(): number {
        return this.design.maxEnergy;
    }
}
```

---

# Manager Pattern
@pattern: logic-separation
@principle: single-responsibility

## Purpose
Separate system logic from state storage.

## Structure

### Manager Interface
```typescript
interface Updateable {
    update(data: IterationData): void;
}

interface IterationData {
    deltaSeconds: number;
    totalSeconds: number;
}
```

### Manager Implementation
```typescript
class SystemManager implements Updateable {
    constructor(private state: ShipState) {}
    
    update({ deltaSeconds }: IterationData) {
        this.updateSystem(deltaSeconds);
    }
    
    private updateSystem(deltaSeconds: number) {
        // System logic here
    }
}
```

## Common Managers

### EnergyManager
@manages: reactor-energy
@updates: energy-generation

```typescript
class EnergyManager implements Updateable {
    constructor(private state: ShipState) {}
    
    update({ deltaSeconds }: IterationData) {
        const reactor = this.state.reactor;
        
        // Generate energy
        reactor.energy += 
            reactor.design.energyPerSecond * 
            reactor.effectiveness * 
            deltaSeconds;
        
        // Cap to max
        if (reactor.energy > reactor.design.maxEnergy) {
            reactor.energy = reactor.design.maxEnergy;
        }
    }
    
    trySpendEnergy(amount: number): boolean {
        if (this.state.reactor.energy >= amount) {
            this.state.reactor.energy -= amount;
            return true;
        }
        return false;
    }
}
```

### HeatManager
@manages: system-heat
@updates: heat-accumulation-dissipation

```typescript
class HeatManager implements Updateable {
    constructor(private state: ShipState) {}
    
    update({ deltaSeconds }: IterationData) {
        for (const system of this.getSystems()) {
            // Dissipate heat
            const coolantRate = this.getCoolantRate(system);
            system.heat -= coolantRate * system.coolantFactor * deltaSeconds;
            
            // Clamp to valid range
            system.heat = Math.max(0, Math.min(MAX_SYSTEM_HEAT, system.heat));
        }
    }
    
    addHeat(system: SystemState, amount: number) {
        system.heat += amount;
    }
}
```

### DamageManager
@manages: system-damage
@updates: defectible-properties

```typescript
class DamageManager {
    constructor(private state: ShipState) {}
    
    applyDamage(systemPointer: string, amount: number) {
        const system = this.getSystem(systemPointer);
        const defectibles = this.getDefectibles(system);
        
        // Damage random defectible
        const target = defectibles[Math.floor(Math.random() * defectibles.length)];
        target.value -= amount;
        
        // Check if system broken
        this.updateBrokenStatus(system);
    }
}
```

---

# System Lifecycle

## Initialization
```typescript
class ShipState extends Spaceship {
    constructor() {
        super();
        
        // Initialize systems
        this.reactor = new Reactor();
        this.thrusters = new ArraySchema<Thruster>();
        this.radar = new Radar();
        this.chainGun = new ChainGun();
        this.warp = new Warp();
    }
}
```

## Update Loop
```typescript
class ShipRoom extends Room<ShipState> {
    private energyManager!: EnergyManager;
    private heatManager!: HeatManager;
    
    onCreate() {
        this.setState(new ShipState());
        this.energyManager = new EnergyManager(this.state);
        this.heatManager = new HeatManager(this.state);
    }
    
    onUpdate(deltaSeconds: number) {
        const data = { deltaSeconds, totalSeconds: 0 };
        
        this.energyManager.update(data);
        this.heatManager.update(data);
        // ... other managers
    }
}
```

## Cleanup
```typescript
onLeave(client: Client) {
    // Mark ship as destroyed
    const ship = this.getShipForClient(client);
    ship.destroyed = true;
}

onDispose() {
    // Cleanup managers
    this.energyManager.dispose?.();
    this.heatManager.dispose?.();
}
```

---

# Adding New Systems

## Step-by-Step Guide

### 1. Create Design State
```typescript
// modules/core/src/ship/my-system.ts
import { DesignState } from './system';
import { gameField } from '../game-field';

class MySystemDesignState extends DesignState {
    @gameField('float32')
    maxCapacity: number = 1000;
    
    @gameField('float32')
    rechargeRate: number = 10;
}
```

### 2. Create System State
```typescript
import { SystemState } from './system';
import { gameField } from '../game-field';
import { range } from '../range';
import { defectible } from './system';

export class MySystem extends SystemState {
    readonly name = 'MySystem';
    readonly broken = false;
    
    @gameField(MySystemDesignState)
    design = new MySystemDesignState();
    
    @defectible({ normal: 1, name: 'efficiency' })
    @range([0, 1])
    @tweakable('number')
    @gameField('float32')
    efficiency: number = 1.0;
    
    @range((t: MySystem) => [0, t.design.maxCapacity])
    @tweakable('number')
    @gameField('float32')
    capacity: number = 1000;
}
```

### 3. Add to ShipState
```typescript
// modules/core/src/ship/ship-state.ts
import { MySystem } from './my-system';

class ShipState extends Spaceship {
    @gameField(MySystem)
    mySystem!: MySystem;
    
    constructor() {
        super();
        this.mySystem = new MySystem();
    }
}
```

### 4. Create Manager
```typescript
// modules/core/src/ship/my-system-manager.ts
import { Updateable, IterationData } from '../updateable';
import { ShipState } from './ship-state';

export class MySystemManager implements Updateable {
    constructor(private state: ShipState) {}
    
    update({ deltaSeconds }: IterationData) {
        const system = this.state.mySystem;
        
        // Recharge capacity
        system.capacity += 
            system.design.rechargeRate * 
            system.effectiveness * 
            deltaSeconds;
        
        // Cap to max
        if (system.capacity > system.design.maxCapacity) {
            system.capacity = system.design.maxCapacity;
        }
    }
    
    tryUse(amount: number): boolean {
        if (this.state.mySystem.capacity >= amount) {
            this.state.mySystem.capacity -= amount;
            return true;
        }
        return false;
    }
}
```

### 5. Integrate Manager
```typescript
// modules/server/src/ship/room.ts
import { MySystemManager } from '@starwards/core/ship';

class ShipRoom extends Room<ShipState> {
    private mySystemManager!: MySystemManager;
    
    onCreate() {
        this.setState(new ShipState());
        this.mySystemManager = new MySystemManager(this.state);
    }
    
    onUpdate(deltaSeconds: number) {
        const data = { deltaSeconds, totalSeconds: 0 };
        this.mySystemManager.update(data);
    }
}
```

### 6. Create UI Widget
```typescript
// modules/browser/src/widgets/my-system.ts
import { createWidget } from './create';

export const mySystem = createWidget({
    name: 'my-system',
    render: (ship: ShipDriver) => {
        const container = document.createElement('div');
        
        // Display system status
        const capacity = ship.state.mySystem.capacity;
        const max = ship.state.mySystem.design.maxCapacity;
        
        container.innerHTML = `
            <div>Capacity: ${capacity.toFixed(0)} / ${max}</div>
            <div>Efficiency: ${(ship.state.mySystem.efficiency * 100).toFixed(0)}%</div>
        `;
        
        return container;
    }
});
```

---

# System Interaction Patterns

## Energy Consumption
@pattern: try-spend
@manager: EnergyManager

```typescript
class WeaponsManager {
    constructor(
        private state: ShipState,
        private energyManager: EnergyManager
    ) {}
    
    fire() {
        const energyCost = this.state.chainGun.design.energyPerShot;
        
        if (this.energyManager.trySpendEnergy(energyCost)) {
            // Fire weapon
            this.createProjectile();
        } else {
            console.warn('Insufficient energy');
        }
    }
}
```

## Heat Generation
@pattern: add-heat
@manager: HeatManager

```typescript
class ThrustManager {
    constructor(
        private state: ShipState,
        private heatManager: HeatManager
    ) {}
    
    update(deltaSeconds: number) {
        for (const thruster of this.state.thrusters) {
            // Generate thrust
            const thrust = this.calculateThrust(thruster);
            
            // Generate heat
            const heat = thrust * thruster.design.heatPerThrust;
            this.heatManager.addHeat(thruster, heat * deltaSeconds);
        }
    }
}
```

## System Dependencies
@pattern: check-effectiveness

```typescript
class RadarManager {
    update(deltaSeconds: number) {
        const radar = this.state.radar;
        
        // Radar only works if powered
        if (radar.effectiveness === 0) {
            return;
        }
        
        // Scan for contacts
        const range = radar.design.maxRange * radar.effectiveness;
        this.scanContacts(range);
    }
}
```

---

# Common System Patterns

## Reactor Pattern
@system: energy-generation
@file: modules/core/src/ship/reactor.ts

```typescript
class Reactor extends SystemState {
    readonly name = 'Reactor';
    readonly broken = false;
    
    @gameField(ReactorDesignState)
    design = new ReactorDesignState();
    
    @defectible({ normal: 1, name: 'efficiency' })
    @range([0, 1])
    @gameField('float32')
    efficiency: number = 1.0;
    
    @range((t: Reactor) => [0, t.design.maxEnergy])
    @gameField('float32')
    energy: number = 1000;
}
```

## Thruster Pattern
@system: propulsion
@file: modules/core/src/ship/thruster.ts

```typescript
class Thruster extends SystemState {
    readonly name = 'Thruster';
    readonly broken = false;
    
    @gameField(ThrusterDesignState)
    design = new ThrusterDesignState();
    
    @defectible({ normal: 1, name: 'thrust efficiency' })
    @range([0, 1])
    @gameField('float32')
    thrustEfficiency: number = 1.0;
    
    @defectible({ normal: 1, name: 'turn efficiency' })
    @range([0, 1])
    @gameField('float32')
    turnEfficiency: number = 1.0;
}
```

## Weapon Pattern
@system: combat
@file: modules/core/src/ship/chain-gun.ts

```typescript
class ChainGun extends SystemState {
    readonly name = 'ChainGun';
    readonly broken = false;
    
    @gameField(ChainGunDesignState)
    design = new ChainGunDesignState();
    
    @range((t: ChainGun) => [0, t.design.maxAmmo])
    @gameField('int32')
    ammo: number = 1000;
    
    @gameField('float32')
    cooldown: number = 0;
    
    get canFire(): boolean {
        return this.ammo > 0 && 
               this.cooldown <= 0 && 
               this.effectiveness > 0;
    }
}
```

---

# System Status

## Status Calculation
@function: getStatus
@returns: 'DISABLED' | 'DAMAGED' | 'OK'

```typescript
// From system.ts:93-105
getStatus: () => {
    if (state.broken) {
        return 'DISABLED';
    }
    if (defectibles.some((d) => {
        const currentValue = state[d.field] as number;
        return currentValue !== d.normal;
    })) {
        return 'DAMAGED';
    }
    return 'OK';
}
```

## Heat Status
@function: getHeatStatus
@returns: 'OVERHEAT' | 'WARMING' | 'OK'

```typescript
getHeatStatus: () => {
    if (state.heat >= MAX_SYSTEM_HEAT) {
        return 'OVERHEAT';
    }
    if (state.heat >= MAX_SYSTEM_HEAT / 2) {
        return 'WARMING';
    }
    return 'OK';
}
```

## Retrieving Systems
@function: getSystems
@returns: System[]

```typescript
import { getSystems } from '@starwards/core';

const systems = getSystems(shipState);
for (const system of systems) {
    console.log(system.state.name);
    console.log(system.getStatus());
    console.log(system.getHeatStatus());
    
    for (const defectible of system.defectibles) {
        console.log(defectible.name, defectible.value, defectible.normal);
    }
}
```

---

# Best Practices

## DO
✓ Extend SystemState for all systems
✓ Create separate DesignState for configuration
✓ Use @defectible for damageable properties
✓ Implement managers for business logic
✓ Use effectiveness in calculations
✓ Validate energy/resource availability
✓ Generate heat for active systems
✓ Check broken status before operations

## DON'T
✗ Put logic in SystemState classes
✗ Skip @defectible on repairable properties
✗ Forget to check effectiveness
✗ Bypass energy/resource checks
✗ Ignore heat accumulation
✗ Modify design values at runtime
✗ Create systems without managers
✗ Skip validation in manager methods

---

# Template: New System

```typescript
// 1. Design State
class MySystemDesignState extends DesignState {
    @gameField('float32')
    maxValue: number = 1000;
}

// 2. System State
export class MySystem extends SystemState {
    readonly name = 'MySystem';
    readonly broken = false;
    
    @gameField(MySystemDesignState)
    design = new MySystemDesignState();
    
    @defectible({ normal: 1, name: 'efficiency' })
    @range([0, 1])
    @tweakable('number')
    @gameField('float32')
    efficiency: number = 1.0;
    
    @range((t: MySystem) => [0, t.design.maxValue])
    @gameField('float32')
    value: number = 1000;
}

// 3. Manager
export class MySystemManager implements Updateable {
    constructor(private state: ShipState) {}
    
    update({ deltaSeconds }: IterationData) {
        // Update logic
    }
}

// 4. Add to ShipState
class ShipState extends Spaceship {
    @gameField(MySystem)
    mySystem!: MySystem;
}

// 5. Integrate in Room
class ShipRoom extends Room<ShipState> {
    private mySystemManager!: MySystemManager;
    
    onCreate() {
        this.mySystemManager = new MySystemManager(this.state);
    }
    
    onUpdate(deltaSeconds: number) {
        this.mySystemManager.update({ deltaSeconds, totalSeconds: 0 });
    }
}
```

---

# Related Specifications

-> see: [STATE_MANAGEMENT_SPEC.md](STATE_MANAGEMENT_SPEC.md)
-> see: [DECORATORS_SPEC.md](DECORATORS_SPEC.md)
-> see: [COMMAND_SYSTEM_SPEC.md](COMMAND_SYSTEM_SPEC.md)