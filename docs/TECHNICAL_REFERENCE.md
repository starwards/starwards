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

**Related:** [API_REFERENCE.md](API_REFERENCE.md) | [PATTERNS.md](PATTERNS.md) | [Colyseus Docs](https://docs.colyseus.io/)
