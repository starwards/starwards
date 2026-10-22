---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/game-field.ts
  - modules/core/src/json-ptr.ts
related:
  - API_REFERENCE.md
last_verified: 2026-06-13
---

# Technical Reference

## @gameField Decorator

Syntax, accepted types and stacking order: [`specs/DECORATORS_SPEC.md`](specs/DECORATORS_SPEC.md).
What it costs on the wire:

- `float32` is a wire type: the server keeps the assigned double; clients and snapshots hold its float32 encoding (~7 significant digits)
- Any change triggers a network sync; updates are batched per patch
- Delta compression sends only changed properties — 90-98% bandwidth reduction

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

**ShipRoom:** JSON Pointer catch-all (relative to ship, for external control) plus typed lock commands, typed repair commands (player ships only), and the `GM_SET_VALUE` GM message

**vs Typed Commands:**

| Feature | JSON Pointer | Typed |
|---------|--------------|-------|
| Type safety | ❌ Runtime only | ✓ Compile-time |
| Flexibility | ✓ Dynamic paths | ❌ Fixed structure |
| Performance | ⚠️ Path parsing | ✓ Optimized |
| Use case | Scripting, external | Common operations |

## Schema Code Generation

**Command:** `npm run build:unity`

**Output:** `modules/core/unity-schema/` (C# classes)

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
5. Write to `modules/core/unity-schema/`

**Unity usage:**
```csharp
var client = new ColyseusClient("ws://localhost:2567");
var room = await client.JoinOrCreate<SpaceState>("space");
room.State.OnChange += (changes) => { /* handle */ };
```

## Native Executable Generation

**Command:** `npm run build:exe` (after `npm run build`)

**Output:** `./dist/exec/` → `starwards-win.exe` and `starwards-linux`. Each is the Node.js binary of
the running version (`.nvmrc`) with the server injected as a [single-executable application](https://nodejs.org/api/single-executable-applications.html).
The binary for the platform other than the build host is downloaded from nodejs.org, checked
against `SHASUMS256.txt` and cached in `~/.cache/starwards-node`.

**Includes:** Game server and all deps as one bundle + static assets + `@colyseus/monitor`'s UI +
embedded Node.js runtime. Left out of the executable: `static/models`, `static/particles`,
`static/environment`, `static/images/grass.jpg`, `static/images/screen-capture.webm`
(`EXCLUDED_STATIC` in `scripts/build-exe.js`). `msgpackr-extract`'s native addon is not bundled;
msgpackr uses its pure-JS implementation.

**Process:**
1. Build all modules (`npm run build`); its `postbuild` stages `dist/static` and bundles `modules/server/src/prod.ts` into `dist/app/starwards.cjs` with esbuild (`scripts/bundle-server.js`)
2. `node --experimental-sea-config` packs the bundle and assets into a blob
3. `postject` injects the blob into a copy of each platform's Node.js binary

**Runtime paths:** the executable serves static files from memory (`modules/server/src/embedded-static.ts`)
and writes recordings and the state snapshot next to the exe (`writableDefault` in
`modules/server/src/app-paths.ts`). `STARWARDS_RECORDINGS_DIR` and `STARWARDS_SNAPSHOT_FILE` override.

The Docker image runs the same bundle with `node app/starwards.cjs`.

**Features:** No install required | Single file | Fast startup | Cross-platform

**Limitations:** Large size (~130-160 MB) | Source not editable

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

**Location:** `modules/browser/src/input/input-config.ts`

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

## Recording File Formats (`.sgr`)

Two on-disk formats, told apart by the first bytes; every reader accepts both through the same records
(`RecordingRecord` in `modules/core/src/recording/recording-binary.ts`).

| | Text (version 1) | Binary (version 2, written today) |
| --- | --- | --- |
| Starts with | `{` (JSON header line) | magic `SGR\x02` (`BINARY_MAGIC`) |
| Layout | one JSON line per frame/base/seg; payloads gzip+base64 | `[u32 length][zstd level 3 frame]` chunks, each holding whole `encodeRecord` records with raw payloads |
| Append/crash | a truncated last line is dropped | a truncated last chunk is dropped (each chunk is its own zstd frame, because decoders stop after the first frame of a concatenation) |

- Node readers: `readRecords` (`modules/server/src/recording/recording-file.ts`), streaming; `payloads: false` skips inflating text frames when only counting.
- Browser reader: `parseRecords` (`modules/browser/src/replay/read-records.ts`, zstd via `fzstd`).
- Convert old files (recursive, idempotent, verified round-trip before replacing, `--out` to keep originals, `--dry-run` for the size saving): `npm --prefix modules/server run migrate-recordings -- <file|dir> [--out <dir>] [--dry-run]`.
