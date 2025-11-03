# Command System Specification

@category: client-server-communication
@stability: stable
@protocol: colyseus-websocket

## Quick Reference

| Command Type | Format | Use Case | Validation |
|--------------|--------|----------|------------|
| JSON Pointer | `/path/to/property` | Dynamic property updates | Auto-range validation |
| Typed Command | `{ cmdName, setValue }` | Structured operations | Custom validation |
| State Command | `StateCommand<T,S,P>` | Type-safe updates | Type-checked |

---

# Command Flow
@pattern: client-server-command
@protocol: websocket

```
Client                    Server                    State
  |                         |                         |
  |--send(command, data)--->|                         |
  |                         |--validate-------------->|
  |                         |                         |
  |                         |--update---------------->|
  |                         |                         |
  |<----state-sync----------|<----auto-sync----------|
```

## Flow Steps

1. **Client Send** - Client calls `room.send(command, data)`
2. **Server Receive** - Room's `onMessage()` handler triggered
3. **Validation** - Command data validated (ranges, types)
4. **State Update** - State property modified
5. **Auto Sync** - Colyseus syncs changes to all clients

---

# JSON Pointer Commands
@standard: RFC-6901
@file: modules/core/src/commands.ts
@pattern: dynamic-property-access

-> enables: path-based-updates
-> validates: automatic-range-capping
-> uses: json-ptr library
:: command-pattern

## Format
```typescript
'/Type/id/property'
'/Type/id/nested/property'
```

## Structure

### Command Message
```typescript
{
    value: Primitive,  // boolean | number | string
    path?: unknown     // Optional path parameter
}
```

### Pointer Syntax
```
/Spaceship/ship-1/rotation          // Ship rotation
/Spaceship/ship-1/reactor/power     // Nested property
/Spaceship/ship-1/thrusters/0/power // Array element
```

## Sending Commands

### Client Side
```typescript
import { sendJsonCmd } from '@starwards/core';

// Send command
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);

// With validation
const pointer = '/Spaceship/ship-1/reactor/power';
const value = 0.75;
sendJsonCmd(room, pointer, value);
```

### Manual Send
```typescript
room.send('/Spaceship/ship-1/rotation', { value: 0.5 });
```

## Server Handling

### Handler Registration
```typescript
import { handleJsonPointerCommand } from '@starwards/core';

class SpaceRoom extends Room<SpaceState> {
    onCreate() {
        this.onMessage('*', (client, message) => {
            const type = message.type;
            if (type.startsWith('/')) {
                handleJsonPointerCommand(message, type, this.state);
            }
        });
    }
}
```

### Handler Implementation
```typescript
// From commands.ts:90-114
export function handleJsonPointerCommand(
    message: unknown, 
    type: string | number, 
    root: Schema
) {
    if (isSetValueCommand(message)) {
        let { value } = message;
        const pointer = getJsonPointer(type);
        
        if (pointer) {
            try {
                // Auto-validate ranges
                if (typeof value === 'number') {
                    const range = tryGetRange(root, pointer);
                    if (range) {
                        value = capToRange(range[0], range[1], value);
                    }
                }
                
                // Update state
                pointer.set(root, value);
                return true;
            } catch (e) {
                console.error(`Error setting value ${value} in ${type}`);
            }
        }
    }
    return false;
}
```

## Automatic Validation
@feature: range-capping
-> uses: @range decorator
-> applies: capToRange()

### Range Validation Flow
```typescript
// 1. Retrieve range from decorator
const range = tryGetRange(root, pointer);

// 2. Cap value if range exists
if (range) {
    value = capToRange(range[0], range[1], value);
}

// 3. Apply capped value
pointer.set(root, value);
```

### Example
```typescript
// State with range
class ShipState extends Schema {
    @range([-1, 1])
    @gameField('float32')
    rotation: number = 0;
}

// Client sends out-of-range value
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 5.0);

// Server auto-caps to range
// rotation = capToRange(-1, 1, 5.0) = 1.0
```

## Usage Examples

### Basic Property Update
```typescript
// Rotation
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);

// Speed
sendJsonCmd(room, '/Spaceship/ship-1/afterBurner', 0.8);

// Boolean
sendJsonCmd(room, '/Spaceship/ship-1/freeze', true);
```

### Nested Property Update
```typescript
// System power
sendJsonCmd(room, '/Spaceship/ship-1/reactor/power', 0.75);

// System heat
sendJsonCmd(room, '/Spaceship/ship-1/thrusters/heat', 50);
```

### Array Element Update
```typescript
// First thruster power
sendJsonCmd(room, '/Spaceship/ship-1/thrusters/0/power', 1.0);

// Second thruster power
sendJsonCmd(room, '/Spaceship/ship-1/thrusters/1/power', 0.5);
```

## Common Mistakes

### ❌ Wrong: Invalid Pointer
```typescript
sendJsonCmd(room, 'rotation', 0.5);  // Missing leading /
sendJsonCmd(room, '/rotation', 0.5);  // Missing type/id
```

### ✅ Correct: Full Path
```typescript
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);
```

### ❌ Wrong: Non-Primitive Value
```typescript
sendJsonCmd(room, '/Spaceship/ship-1/position', { x: 10, y: 20 });
```

### ✅ Correct: Update Properties Separately
```typescript
sendJsonCmd(room, '/Spaceship/ship-1/position/x', 10);
sendJsonCmd(room, '/Spaceship/ship-1/position/y', 20);
```

---

# Typed Commands
@pattern: structured-commands
@file: modules/core/src/commands.ts

-> enables: type-safe-operations
-> validates: custom-logic
-> uses: StateCommand interface
:: command-pattern

## StateCommand Interface
```typescript
interface StateCommand<T, S extends Schema, P> {
    cmdName: string;
    setValue(state: S, value: T, path: P): unknown;
}
```

### Type Parameters
- `T` - Value type
- `S` - State type (extends Schema)
- `P` - Path type (optional context)

## Defining Commands

### Basic Command
```typescript
const rotateCmd: StateCommand<number, ShipState, void> = {
    cmdName: 'rotate',
    setValue: (state, value) => {
        state.rotation = capToRange(-1, 1, value);
    }
};
```

### Command with Path
```typescript
const setPowerCmd: StateCommand<number, ShipState, string> = {
    cmdName: 'setPower',
    setValue: (state, value, systemPath) => {
        const system = getSystemByPath(state, systemPath);
        system.power = capToRange(0, 1, value);
    }
};
```

### Numeric Command with Range
```typescript
type NumericStatePropertyCommand = {
    cmdName: string;
    setValue(state: Schema, value: number, path: unknown): unknown;
    getValue(state: Schema, path: unknown): number;
    range: [number, number] | ((state: Schema, path: unknown) => [number, number]);
};

const energyCmd: NumericStatePropertyCommand = {
    cmdName: 'setEnergy',
    setValue: (state, value) => state.reactor.energy = value,
    getValue: (state) => state.reactor.energy,
    range: (state) => [0, state.reactor.design.maxEnergy]
};
```

## Sending Typed Commands

### Client Side
```typescript
import { cmdSender } from '@starwards/core';

// Create sender
const rotate = cmdSender(room, rotateCmd, undefined);

// Send command
rotate(0.5);

// With path
const setPower = cmdSender(room, setPowerCmd, 'reactor');
setPower(0.75);
```

### Direct Send
```typescript
room.send('rotate', { value: 0.5, path: undefined });
room.send('setPower', { value: 0.75, path: 'reactor' });
```

## Server Handling

### Handler Registration
```typescript
import { cmdReceivers, cmdReceiver } from '@starwards/core';

class ShipRoom extends Room<ShipState> {
    onCreate() {
        // Register multiple commands
        for (const [cmdName, receiver] of cmdReceivers(commands, this)) {
            this.onMessage(cmdName, receiver);
        }
        
        // Or register single command
        this.onMessage(
            rotateCmd.cmdName, 
            cmdReceiver(this, rotateCmd)
        );
    }
}
```

### Command Collection
```typescript
// commands.ts
export const shipCommands = {
    rotate: rotateCmd,
    setPower: setPowerCmd,
    setTarget: setTargetCmd,
    // ...
};

// room.ts
for (const [cmdName, receiver] of cmdReceivers(shipCommands, this)) {
    this.onMessage(cmdName, receiver);
}
```

## Usage Examples

### Simple Command
```typescript
// Define
const fireCmd: StateCommand<void, ShipState, void> = {
    cmdName: 'fire',
    setValue: (state) => {
        if (state.chainGun.canFire) {
            state.chainGun.fire();
        }
    }
};

// Send
room.send('fire', { value: undefined, path: undefined });
```

### Command with Validation
```typescript
const setTargetCmd: StateCommand<string, ShipState, void> = {
    cmdName: 'setTarget',
    setValue: (state, targetId) => {
        // Validate target exists
        const target = state.space.ships.get(targetId);
        if (target) {
            state.targetId = targetId;
        } else {
            console.warn('Invalid target:', targetId);
        }
    }
};
```

### Command with Complex Logic
```typescript
const warpCmd: StateCommand<XY, ShipState, void> = {
    cmdName: 'warp',
    setValue: (state, destination) => {
        // Check energy
        const cost = calculateWarpCost(state.position, destination);
        if (state.reactor.energy < cost) {
            console.warn('Insufficient energy for warp');
            return;
        }
        
        // Execute warp
        state.reactor.energy -= cost;
        state.position.setValue(destination);
        state.velocity.setValue({ x: 0, y: 0 });
    }
};
```

---

# Command Routing
@pattern: message-routing
@framework: colyseus

## Client → Room → Handler

### Client Layer
```typescript
// Client code
import { ShipDriver } from '@starwards/core/client';

const driver = new ShipDriver(room);
driver.rotate(0.5);  // Sends command
```

### Room Layer
```typescript
// Server room
class ShipRoom extends Room<ShipState> {
    onCreate() {
        this.onMessage('rotate', (client, message) => {
            const ship = this.getShipForClient(client);
            this.handleRotate(ship, message);
        });
    }
    
    private handleRotate(ship: ShipState, message: { value: number }) {
        ship.rotation = capToRange(-1, 1, message.value);
    }
}
```

### Handler Layer
```typescript
// Separate handler
class CommandHandler {
    constructor(private room: ShipRoom) {}
    
    handleRotate(client: Client, message: { value: number }) {
        const ship = this.room.getShipForClient(client);
        ship.rotation = capToRange(-1, 1, message.value);
    }
}
```

## Multi-Room Routing

### Space Commands
```typescript
// Space room handles space-level commands
class SpaceRoom extends Room<SpaceState> {
    onCreate() {
        this.onMessage('createAsteroid', this.handleCreateAsteroid);
        this.onMessage('createExplosion', this.handleCreateExplosion);
    }
}
```

### Ship Commands
```typescript
// Ship room handles ship-level commands
class ShipRoom extends Room<ShipState> {
    onCreate() {
        this.onMessage('rotate', this.handleRotate);
        this.onMessage('fire', this.handleFire);
    }
}
```

---

# Error Handling
@pattern: graceful-degradation

## Validation Errors

### Range Validation
```typescript
// Auto-handled by JSON Pointer commands
if (typeof value === 'number') {
    const range = tryGetRange(root, pointer);
    if (range) {
        value = capToRange(range[0], range[1], value);
    }
}
```

### Type Validation
```typescript
function validateCommand(message: unknown): message is SetValueCommand {
    if (!isSetValueCommand(message)) {
        console.error('Invalid command format');
        return false;
    }
    return true;
}
```

### Custom Validation
```typescript
const setTargetCmd: StateCommand<string, ShipState, void> = {
    cmdName: 'setTarget',
    setValue: (state, targetId) => {
        // Validate target exists
        if (!state.space.ships.has(targetId)) {
            console.warn('Target not found:', targetId);
            return;
        }
        
        // Validate not self
        if (targetId === state.id) {
            console.warn('Cannot target self');
            return;
        }
        
        state.targetId = targetId;
    }
};
```

## Error Logging

### Server Side
```typescript
try {
    pointer.set(root, value);
} catch (e) {
    console.error(
        `Error setting value ${String(value)} in ${type}: ${printError(e)}`
    );
}
```

### Client Side
```typescript
room.onError((code, message) => {
    console.error('Room error:', code, message);
});

room.onLeave((code) => {
    if (code > 1000) {
        console.error('Abnormal disconnect:', code);
    }
});
```

---

# Command Examples by System

## Helm Commands
```typescript
// Rotation
sendJsonCmd(room, '/Spaceship/ship-1/rotation', 0.5);

// Afterburner
sendJsonCmd(room, '/Spaceship/ship-1/afterBurner', 0.8);

// Warp
room.send('warp', { 
    value: { x: 1000, y: 2000 }, 
    path: undefined 
});
```

## Weapons Commands
```typescript
// Target selection
room.send('setTarget', { 
    value: 'enemy-ship-1', 
    path: undefined 
});

// Fire
room.send('fire', { 
    value: undefined, 
    path: undefined 
});

// Chain gun power
sendJsonCmd(room, '/Spaceship/ship-1/chainGun/power', 1.0);
```

## Engineering Commands
```typescript
// Reactor power
sendJsonCmd(room, '/Spaceship/ship-1/reactor/power', 0.75);

// Thruster power
sendJsonCmd(room, '/Spaceship/ship-1/thrusters/0/power', 1.0);

// Coolant
sendJsonCmd(room, '/Spaceship/ship-1/reactor/coolantFactor', 0.5);
```

## GM Commands
```typescript
// Create asteroid
room.send('createAsteroid', {
    value: { position: { x: 100, y: 200 }, radius: 5 },
    path: undefined
});

// Pause game
sendJsonCmd(room, '/Admin/paused', true);

// Time scale
sendJsonCmd(room, '/Admin/timeScale', 0.5);
```

---

# Creating New Commands

## Step-by-Step Guide

### 1. Define Command
```typescript
// commands/my-command.ts
import { StateCommand } from '@starwards/core';

export const myCmd: StateCommand<MyValueType, MyStateType, void> = {
    cmdName: 'myCommand',
    setValue: (state, value) => {
        // Validation
        if (!isValid(value)) {
            console.warn('Invalid value');
            return;
        }
        
        // Update state
        state.myProperty = value;
    }
};
```

### 2. Register Handler
```typescript
// room.ts
import { myCmd } from './commands/my-command';
import { cmdReceiver } from '@starwards/core';

class MyRoom extends Room<MyState> {
    onCreate() {
        this.onMessage(
            myCmd.cmdName,
            cmdReceiver(this, myCmd)
        );
    }
}
```

### 3. Create Client Sender
```typescript
// client/driver.ts
import { cmdSender } from '@starwards/core';
import { myCmd } from '../commands/my-command';

class MyDriver {
    private sendMyCommand: (value: MyValueType) => void;
    
    constructor(private room: Room) {
        this.sendMyCommand = cmdSender(room, myCmd, undefined);
    }
    
    doSomething(value: MyValueType) {
        this.sendMyCommand(value);
    }
}
```

### 4. Use in Client
```typescript
// client code
const driver = new MyDriver(room);
driver.doSomething(myValue);
```

## Template: New Command

```typescript
// 1. Define command
export const newCmd: StateCommand<ValueType, StateType, PathType> = {
    cmdName: 'newCommand',
    setValue: (state, value, path) => {
        // Validate
        if (!validate(value)) return;
        
        // Update
        state.property = value;
    }
};

// 2. Register in room
this.onMessage(newCmd.cmdName, cmdReceiver(this, newCmd));

// 3. Send from client
room.send('newCommand', { value: myValue, path: myPath });
```

---

# Best Practices

## DO
✓ Use JSON Pointer for simple property updates
✓ Use Typed Commands for complex operations
✓ Validate all user inputs
✓ Use @range decorator for automatic validation
✓ Log errors with context
✓ Cap numeric values to valid ranges
✓ Check preconditions before state updates

## DON'T
✗ Skip validation on user inputs
✗ Use commands for internal state updates
✗ Forget error handling
✗ Send non-primitive values in JSON Pointer commands
✗ Bypass Colyseus state synchronization
✗ Create commands for every property
✗ Mix command types unnecessarily

---

# Related Specifications

-> see: [STATE_MANAGEMENT_SPEC.md](STATE_MANAGEMENT_SPEC.md)
-> see: [DECORATORS_SPEC.md](DECORATORS_SPEC.md)
-> see: [SHIP_SYSTEMS_SPEC.md](SHIP_SYSTEMS_SPEC.md)