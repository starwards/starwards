# JSON Pointer command surface

The JSON Pointer setter (`modules/core/src/json-ptr.ts`,
`handleJsonPointerCommand` in `modules/core/src/commands.ts`) is the
generic mechanism the browser, Node-RED, and external integrations use
to mutate ship and space state at runtime. RFC 6901 syntax is validated
on the wire, but the actual write target (a `@gameField` somewhere on a
`Schema` subclass) is **not** automatically remotely writable.

## The `@commandable` decorator

A property must be explicitly marked `@commandable()` for the JSON Pointer
setter to write to it:

```ts
import { commandable, gameField } from '../game-field';

class Reactor extends SystemState {
    @range([0, 1])
    @tweakable({ type: 'enum', enum: PowerLevel })
    @commandable()
    @gameField('float32')
    public power = PowerLevel.MAX;
}
```

The decorator must be invoked with parentheses (`@commandable()`, not
`@commandable`). The Colyseus Unity codegen tool only understands
CallExpression decorators on `@gameField` properties; a bare-identifier
decorator crashes its parser.

A bare `@gameField` is still synced **server → client** (read-only from
the client's point of view). Only `@commandable` fields participate in
the **client → server** command surface.

`@commandable` walks the prototype chain, so subclasses inherit
allowlists from their parent classes. (`Reactor` inherits `power` from
`SystemState`, etc.)

## Strict mode

`json-ptr.ts` enforces the whitelist in two phases so deployments can
roll forward gradually:

| Mode | Trigger | Behavior on non-`@commandable` write |
|---|---|---|
| **Warn-only** (default) | `STARWARDS_STRICT_CMD` unset | `console.warn` once per (Schema, field) pair, then proceed |
| **Strict** | `STARWARDS_STRICT_CMD=1` | Throw. The throw is caught by `handleJsonPointerCommand` and logged by `ShipRoom`, so a buggy client can't crash the server. |

CI runs **strict** (`Test-Units` and `Test-E2e` jobs both export
`STARWARDS_STRICT_CMD=1`), so any new `@gameField` that's missing
`@commandable` and is exercised by a test will fail the build. A
production server keeps booting in warn-only mode for one release,
giving the audit log time to surface anything the test suite missed.

## Adding a new commandable property

1. Decide whether the field is server-internal (sync only), client-input
   (commandable), or both. If unclear, leave it sync-only and add
   `@commandable` later when a real send site appears.
2. Add `@commandable` adjacent to `@gameField` (the codebase convention
   is to keep `@gameField` innermost, but `@commandable` itself does
   not interact with the property descriptor and can sit anywhere in
   the decorator stack).
3. Add a unit test that calls `handleJsonPointerCommand(...)` with
   `STARWARDS_STRICT_CMD=1` set and asserts the write took effect.

## Auditing existing send sites

Search for the send sites:

```bash
# Browser screens
grep -rn "writeProp\|readWriteProp\|readWriteNumberProp" modules/browser/src

# Node-RED
grep -rn "sendJsonCmd" modules/node-red/src

# Integration tests
grep -rn "sendCommand\|node\.receive" modules
```

Each pointer string corresponds to a target field that must be
`@commandable`. The first round of `@commandable` annotations covers
fields exercised directly by the existing CI suite
(`Spaceship.angle`, `SystemState.power`, `Magazine.capacity`). A
follow-up sweep marks the remaining browser-driven fields and removes
the warn-only mode entirely.

## Why a whitelist instead of `Reflect.set` everywhere

The previous behavior was to `Reflect.set` any RFC-6901-valid path. That
made every new `@gameField` accidentally remote-writable, including
fields that exist purely as server-side mirror state. A typo or
malicious client could rewrite simulation invariants. The whitelist
makes the remote surface explicit, grep-able, and code-reviewable.
