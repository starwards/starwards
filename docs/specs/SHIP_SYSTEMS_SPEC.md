---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/ship/system.ts
  - modules/core/src/ship
related:
  - ../SUBSYSTEMS.md
last_verified: 2026-06-13
---

# Ship Systems Specification

@category: game-mechanics
@stability: stable
@location: modules/core/src/ship

## Quick Reference

| System | Purpose | Key Properties | Manager |
|--------|---------|----------------|---------|
| Reactor | Energy generation | energy, power | EnergyManager |
| Thruster | Propulsion | thrust, turn | MovementManager |
| Radar | Detection | range, arc, malfunctionRangeFactor | (no dedicated manager) |
| ChainGun | Weapons | isFiring, rateOfFireFactor, bearingSkew | ChainGunManager |
| Warp | FTL travel | level, charging | (no dedicated manager) |

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
    power: number = PowerLevel.NORMAL;
    
    @range([0, 1])
    @gameField('float32')
    hacked: number = HackLevel.OK;
    
    @gameField('boolean')
    energyStarved = false; // set by EnergyManager.drawEnergy when the reactor can't cover a draw
    
    get isInternal(): boolean;    // delegates to design.isInternal
    get isElectronics(): boolean; // delegates to design.isElectronics
    
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
    NORMAL = 0.5,
    HIGH = 0.75,
    MAX = 1
}
```

**Usage:**
```typescript
system.power = PowerLevel.HIGH;  // 0.75
system.power = 0.5;              // NORMAL
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
    static readonly isStarwardsDesignState = true; // marker read by isCommandable (game-field.ts) so the GM panel can write design fields over JSON Pointer
    
    @gameField('string') modelName = '';
    @gameField('boolean') isInternal = false;
    @gameField('boolean') isElectronics = false;
    
    keys() {
        // In Colyseus schema v3, use Symbol.metadata to access schema property definitions
        const metadata = (this.constructor as any)[Symbol.metadata];
        const keys: string[] = [];
        for (const index in metadata) {
            const field = metadata[index] as any;
            if (!field.deprecated && field.name) {
                keys.push(field.name);
            }
        }
        return keys;
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
    readonly deltaSeconds: number;
    readonly deltaSecondsAvg: number;
    readonly totalSeconds: number;
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
    
    // shortage: every draw this tick gets the same supply ratio
    drawEnergy(amount: number): number {
        this.demand += amount;
        const granted = Math.min(amount * this.supplyRatio, this.state.reactor.energy);
        this.state.reactor.energy -= granted;
        return granted / amount; // fraction granted: scale the effect by it
    }
}
```

### HeatManager
@manages: system-heat
@updates: heat-accumulation-dissipation

```typescript
export const MAX_SYSTEM_HEAT = 100;
export class HeatManager implements Updateable {
    constructor(private state: ShipState, private damageManager: DamageManager) {}
    addHeat(value: number, system: ShipSystem) // clamps at MAX_SYSTEM_HEAT; overflow -> damageManager.damageSystem(system, {id:'overheat', amount}, 1)
    reduceHeat(value: number, system: ShipSystem) // floors at 0
    update({ deltaSeconds }: IterationData) // splits state.design.totalCoolant across systems() in proportion to coolantFactor (evenly if all factors are 0) and calls reduceHeat
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
// ShipState composes the Spaceship (it does not extend it); systems are built
// from the ship's design by make-ship-state.ts, not by the constructor.
class ShipState extends Schema {
    @gameField(Spaceship)
    spaceship: Spaceship = new Spaceship();
    
    @gameField(Reactor)
    reactor!: Reactor;
    
    @gameField([Thruster])
    thrusters!: ArraySchema<Thruster>;
    
    @gameField([Radar])
    radars = new ArraySchema<Radar>();
    
    @gameField([ChainGun])
    chainGuns = new ArraySchema<ChainGun>();
    
    @gameField(Warp)
    warp: Warp | null = null;
}
```

## Update Loop
```typescript
// Managers are owned by ShipManager, not ShipRoom (modules/server/src/ship/room.ts
// only receives the ShipManager in onCreate). Shared managers (e.g. HeatManager) are
// constructed in ship-manager-abstract.ts, player-ship-only ones (e.g. EnergyManager,
// RepairManager) in ship-manager.ts; dependencies are constructor arguments.
this.heatManager = new HeatManager(this.state, this.damageManager);
this.energyManager = new EnergyManager(this.state, this.heatManager);

// each tick
update(id: IterationData) {
    this.heatManager.update(id);
    this.energyManager.update(id);
    // ... other managers
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

class ShipState extends Schema {
    @gameField(MySystem)
    mySystem!: MySystem; // built from the ship design in make-ship-state.ts
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
// modules/core/src/ship/ship-manager.ts
import { MySystemManager } from './my-system-manager';

// in the ShipManager constructor
this.mySystemManager = new MySystemManager(this.state);

// in ShipManager.update(id: IterationData)
this.mySystemManager.update(id);
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
@pattern: proportional-draw
@manager: EnergyManager

```typescript
class WeaponsManager {
    constructor(
        private state: ShipState,
        private energyManager: EnergyManager
    ) {}
    
    fire() {
        const energyCost = this.state.chainGun.design.energyPerShot;
        
        const supply = this.energyManager.drawEnergy(energyCost);
        // load at the granted fraction of full rate
        this.state.chainGun.loading += this.loadingDelta * supply;
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
            this.heatManager.addHeat(heat * deltaSeconds, thruster);
        }
    }
}
```

## System Dependencies
@pattern: check-effectiveness

```typescript
class RadarManager {
    update(deltaSeconds: number) {
        for (const radar of this.state.radars) {
            // Radar only works if powered
            if (radar.effectiveness === 0) {
                continue;
            }

            // Scan for contacts; range already accounts for effectiveness
            this.scanContacts(radar.range);
        }
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

    @gameField(ReactorDesignState)
    design = new ReactorDesignState();

    @range([0, 1])
    @defectible({ normal: 1, name: 'effeciency' })
    @gameField('float32')
    effeciencyFactor = 1;

    @range((t: Reactor) => [0, t.design.maxEnergy])
    @gameField('number')
    energy = 1000;

    get broken() {
        return this.effeciencyFactor === 0;
    }
}
```

## Turret Pattern (shared mount base)
@system: mounts
@file: modules/core/src/ship/turret.ts

Radars, chain guns, tubes and thrusters all extend `Turret` — the rotating
mount every bearing-carrying system shares. `bearingSkew` and `broken` below
are inherited, not redeclared, by every subclass; a subclass only overrides
`broken` to OR in its own failure condition.

```typescript
abstract class Turret extends SystemState {
    abstract readonly design: TurretDesignState; // carries maxBearingSkew

    @gameField('float32')
    fittedBearing = 0; // where the mount is bolted, relative to the ship; fixed after fitting

    @gameField('float32')
    bearing = 0; // where it's pointing now, relative to fittedBearing

    // damage-driven skew off the commanded bearing. Declared only where
    // design.maxBearingSkew > 0 — a mount with no skew surface (e.g. an omni
    // radar) never shows this as a defectible.
    @defectible({ normal: 0, name: 'bearing skew', enabled: (t) => t.design.maxBearingSkew > 0 })
    @range((t: Turret) => [-t.design.maxBearingSkew, t.design.maxBearingSkew])
    @gameField('float32')
    bearingSkew = 0;

    get broken(): boolean {
        return this.design.maxBearingSkew > 0 && Math.abs(this.bearingSkew) >= this.design.maxBearingSkew;
    }
}
```

## Thruster Pattern
@system: propulsion
@file: modules/core/src/ship/thruster.ts

```typescript
class Thruster extends Turret {
    @gameField(ThrusterDesignState)
    design = new ThrusterDesignState();

    @range([0, 1])
    @defectible({ normal: 1, name: 'capacity' })
    @gameField('float32')
    availableCapacity = 1.0;

    get broken(): boolean {
        return super.broken || this.availableCapacity === 0;
    }
}
```

## Weapon Pattern
@system: combat
@file: modules/core/src/ship/chain-gun.ts

```typescript
class ChainGun extends Turret {
    @gameField('boolean')
    isFiring = false;

    @range([0, 1])
    @gameField('float32')
    loading = 0;

    @range([0, 1])
    @defectible({ normal: 1, name: 'rate of fire' })
    @gameField('float32')
    rateOfFireFactor = 1;

    @gameField('string')
    projectile: SelectedProjectileModel = 'None';

    @gameField(ChaingunDesignState)
    design = new ChaingunDesignState();

    get broken(): boolean {
        return super.broken || this.rateOfFireFactor <= 0;
    }
}

// Note: ammo capacity is not tracked on ChainGun. It lives on a separate
// Magazine system (e.g. the browser ammo widget reads shipDriver.state.magazine).
```

---

# System Status

## Status Calculation
@function: getStatus
@returns: 'DISABLED' | 'DAMAGED_STARVED' | 'STARVED' | 'DAMAGED' | 'OK'

```typescript
// From system.ts
getStatus: () => {
    if (state.broken) {
        return 'DISABLED';
    }
    const isDamaged = defectibles.some((d) => {
        const currentValue = state[d.field] as number;
        return currentValue !== d.normal;
    });
    if (state.energyStarved) {
        return isDamaged ? 'DAMAGED_STARVED' : 'STARVED';
    }
    return isDamaged ? 'DAMAGED' : 'OK';
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
class ShipState extends Schema {
    @gameField(MySystem)
    mySystem!: MySystem;
}

// 5. Integrate in ShipManager (constructor + update)
this.mySystemManager = new MySystemManager(this.state);
// ShipManager.update(id: IterationData):
this.mySystemManager.update(id);
```

---

# Related Specifications

-> see: [STATE_MANAGEMENT_SPEC.md](STATE_MANAGEMENT_SPEC.md)
-> see: [DECORATORS_SPEC.md](DECORATORS_SPEC.md)
-> see: [COMMAND_SYSTEM_SPEC.md](COMMAND_SYSTEM_SPEC.md)