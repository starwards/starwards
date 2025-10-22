# Technical Reference

## @gameField Decorator
**Location:** `modules/core/src/game-field.ts:16`

**Marks properties for Colyseus schema serialization + auto-sync**

```typescript
@gameField('float32') speed = 0;                    // Primitives
@gameField(Radar) radar!: Radar;                    // Nested schema
@gameField([Thruster]) thrusters = new ArraySchema<Thruster>();  // Array
@gameField({ map: Spaceship }) ships = new MapSchema<Spaceship>(); // Map
```

**Types:** `int8|int16|int32|float32|float64|boolean|string` | Schema | `[Schema]` | `{map:Schema}`

**Behavior:**
- float32 rounds to 2 decimals
- Triggers network sync on change
- Must be last decorator in stack

**Network:** Delta compression (only changed props), batched updates, 90-98% bandwidth reduction

## JSON Pointer Commands
**RFC 6901** - Dynamic state updates

**Format:** `/ObjectType/${objectId}/propertyPath`

**Examples:**
```typescript
'/Spaceship/ship-1/rotation'
'/Spaceship/ship-2/reactor/power'
'/Spaceship/ship-3/thrusters/0/active'
```

**Server handler:** `handleJsonPointerCommand(msg, type, root)` → validate pointer → check range → cap → update → sync

**Client:**
```typescript
room.send({type: '/Spaceship/ship-1/rotation', value: 0.5});
```

**ShipRoom:** JSON Pointer only (all commands relative to ship, for external control)

**vs Typed Commands:**

| Feature | JSON Pointer | Typed |
|---------|--------------|-------|
| Type safety | ❌ Runtime only | ✓ Compile-time |
| Flexibility | ✓ Dynamic paths | ❌ Fixed structure |
| Performance | ⚠️ Path parsing | ✓ Optimized |
| Use case | Scripting, external | Common operations |

## Schema Code Generation

**Command:** `npm run build:unity`

**Output:** `./unity-schema/` (C# classes)

**Type Mappings:**

| TypeScript | C# |
|------------|-----|
| float32 | float |
| int8 | sbyte |
| int16 | short |
| int32 | int |
| boolean | bool |
| string | string |
| Schema | C# class |
| ArraySchema<T> | ArraySchema<T> |

**Process:**
1. Parse TS files for @gameField
2. Extract class structure
3. Map types TS→C#
4. Generate C# with Colyseus attributes
5. Write to `./unity-schema/`

**Unity usage:**
```csharp
var client = new ColyseusClient("ws://localhost:2567");
var room = await client.JoinOrCreate<SpaceState>("space");
room.State.OnChange += (changes) => { /* handle */ };
```

## Native Executable Generation

**Command:** `npm run pkg`

**Output:** `./dist/` → `starwards-linux|starwards-macos|starwards-win.exe`

**Includes:** Game server + all deps + static assets + embedded Node.js runtime

**Process:**
1. Build all modules (`npm run build`)
2. Bundle server with deps
3. Include `./static/`
4. Embed Node.js runtime
5. Generate platform executables

**Config:**
```json
{
  "pkg": {
    "targets": ["node20-linux-x64", "node20-macos-x64", "node20-win-x64"],
    "assets": ["./static/**/*", "./dist/**/*"],
    "output": "dist/starwards"
  }
}
```

**Features:** No install required | Single file | Fast startup | Cross-platform

**Limitations:** Large size (~50-100 MB) | Native modules need platform builds | Source not editable

## Input Configuration System
**Location:** `modules/browser/src/input/input-config.ts`

**Purpose:** Maps keyboard keys and gamepad controls to ship commands with configurable behavior

### Configuration Classes

#### KeysRangeConfig
**Step-based keyboard input** - each key press increments/decrements by step value
```typescript
class KeysRangeConfig {
    constructor(
        public up: string,        // Key to increment
        public down: string,      // Key to decrement
        public center: string,    // Key combo to reset
        public step: number,      // Increment/decrement amount
    ) {}
}
```

**Example:**
```typescript
rotationCommand: {
    offsetKeys: new KeysRangeConfig('e', 'q', 'e+q,q+e', 0.05)
}
// Press 'e' → rotationCommand += 0.05
// Press 'q' → rotationCommand -= 0.05
// Press 'e+q' → rotationCommand = 0
```

#### GamepadAxisConfig
**Analog gamepad input** with deadzone support
```typescript
class GamepadAxisConfig {
    constructor(
        public gamepadIndex: number,
        public axisIndex: number,
        public deadzone?: [number, number],  // [min, max] ignore range
        public inverted?: boolean,
        public velocity?: number,
    ) {}
}
```

**Example:**
```typescript
rotationCommand: {
    axis: new GamepadAxisConfig(0, 0, [-0.1, 0.1])
}
// Left stick X-axis (0), ignore inputs between -0.1 and 0.1
```

#### GamepadButtonConfig
**Digital gamepad button**
```typescript
class GamepadButtonConfig {
    constructor(
        public gamepadIndex: number,
        public buttonIndex: number,
    ) {}
}
```

#### RangeConfig
**Combines keyboard and gamepad for a single command**
```typescript
interface RangeConfig {
    axis?: GamepadAxisConfig;           // Gamepad analog control
    buttons?: GamepadButtonsRangeConfig; // Gamepad button control
    offsetKeys?: KeysRangeConfig;        // Keyboard step control
}
```

### Ship Input Configuration

**Location:** `modules/browser/src/input/input-config.ts:75`

```typescript
export const shipInputConfig = {
    // Simple button mappings
    tubeIsFiring: 'x',
    warpUp: 'r',
    warpDown: 'f',

    // Range controls (keyboard + gamepad)
    rotationCommand: {
        axis: new GamepadAxisConfig(0, 0, [-0.1, 0.1]),
        offsetKeys: new KeysRangeConfig('e', 'q', 'e+q,q+e', 0.05),
    },
    strafeCommand: {
        axis: new GamepadAxisConfig(0, 2, [-0.1, 0.1]),
        offsetKeys: new KeysRangeConfig('d', 'a', 'a+d,d+a', 0.05),
    },
    boostCommand: {
        axis: new GamepadAxisConfig(0, 3, [-0.1, 0.1], true),
        offsetKeys: new KeysRangeConfig('w', 's', 'w+s,s+w', 0.05),
    },
};
```

### Key Behaviors

**Step-based keyboard (offsetKeys):**
- Each key press increments/decrements by `step` value
- Values accumulate (press 'w' twice → boostCommand = 0.10)
- Center key combo resets to 0
- Used for: rotation, strafe, boost

**Gamepad axis (axis):**
- Maps analog stick position directly to command value
- Deadzone ignores small inputs (stick drift)
- Inverted flag reverses direction
- Used for: rotation, strafe, boost

**Simple buttons:**
- String key or GamepadButtonConfig
- Binary on/off state
- Used for: firing, warp, docking

### Testing Implications

**E2E tests are coupled to step values:**
```typescript
// ❌ Wrong - assumes absolute value
await page.keyboard.press('w');
await waitForPropertyFloatValue(page, 'boostCommand', 1.0);

// ✓ Correct - uses step value from config
await page.keyboard.press('w');
await waitForPropertyFloatValue(page, 'boostCommand', 0.05);
```

**Why:** Keyboard input uses step-based accumulation, not absolute values. Each press adds/subtracts the configured `step` (0.05 for all movement commands).

**See:** [Testing Guide - E2E Anti-Patterns](testing/README.md#e2e-anti-patterns) for more details.

**Related:** [API_REFERENCE.md](API_REFERENCE.md) | [PATTERNS.md](PATTERNS.md) | [Colyseus Docs](https://docs.colyseus.io/)
