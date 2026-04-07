# JSON Pointer command surface

The JSON Pointer setter (`modules/core/src/json-ptr.ts`,
`handleJsonPointerCommand` in `modules/core/src/commands.ts`) is the
generic mechanism the browser, Node-RED, and external integrations use
to mutate ship and space state at runtime. RFC 6901 syntax is validated
on the wire, but the actual write target (a `@gameField` somewhere on a
`Schema` subclass) is **not** automatically remotely writable.

`isCommandable` in `modules/core/src/game-field.ts` is the single
admission predicate. A write is allowed if **any** of three categories
match:

1. **`@commandable()`** — an explicit, grep-able player-command surface.
   Used for helm input, weapon fire, subsystem power, etc.
2. **`@tweakable`** — any field annotated for the GM tweak panel is
   implicitly commandable (see "GM direct-control surface" below).
3. **`DesignState` subclass** — every field on any `FooDesignState`
   class is implicitly commandable so the GM design-state panel can
   live-edit subsystem constants (see "GM direct-control surface").

## GM direct-control surface

The GM tweak panel is the game-running tool. It is **not** an edge case:
it is how scenarios are actually run, and it expects direct control over
ship and space-object state during a live session. Two browser widgets
produce the writes:

- **`modules/browser/src/widgets/tweak.ts`** — calls `getTweakables(state)`
  and wires every `@tweakable` field on the currently-selected schema
  subject to `readWriteProp` / `readWriteNumberProp`. Pointer strings
  look like `${systemPointer}/${field}`. Mounted only on
  `modules/browser/src/screens/gm.ts`.
- **`modules/browser/src/widgets/design-state.ts`** — for every
  subsystem that has a `design = new FooDesignState()` field, walks the
  `DesignState` subclass dynamically via `DesignState.keys()` and
  wires each key to `readWriteProp` at pointer
  `${system}/design/${constName}`. Mounted on `screens/gm.ts` and also
  on the `screens/ship.ts` "Empty Screen" dashboard.

For the whitelist to avoid spamming warnings (warn-only mode) or
breaking the GM panel (strict mode, Phase B), `isCommandable` admits
both categories without requiring per-field annotation. The
`@tweakable` check reuses the existing `tweakablePropertyMetadataKey`
symbol from `modules/core/src/tweakable.ts`. The `DesignState` check
uses a static marker (`static readonly isStarwardsDesignState = true`)
on the abstract base class; JavaScript inherits class statics through
`extends`, so every concrete subclass carries it for free, and the
marker avoids a dependency cycle that would otherwise arise from
importing `DesignState` into `game-field.ts` (`range.ts` imports from
`json-ptr.ts`, and `ship/system.ts` imports from `../range`).

### Limitation: shared room channel

Today's `ShipRoom` has no connection-level GM-vs-player identity
(`modules/server/src/ship/room.ts` defines no `onAuth`, no client-type
field). GM and player clients join the same room and send through the
same `onMessage('*')` handler. That means the whitelist's GM-side
admissions (`@tweakable` + `DesignState`) are reachable from a
malicious _player_ client too. The whitelist's value in today's
architecture is **accidental-exposure protection**: a contributor who
adds a bare `@gameField` for sync purposes does NOT get a wire-write
handle for free.

Narrowing the player attack surface relative to the GM's requires a
connection-level role split, tracked as **Phase C** in
`docs/maintainers.md`.

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

| Mode                    | Trigger                      | Behavior on non-`@commandable` write                                                                                         |
| ----------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Warn-only** (default) | `STARWARDS_STRICT_CMD` unset | `console.warn` once per (Schema, field) pair, then proceed                                                                   |
| **Strict**              | `STARWARDS_STRICT_CMD=1`     | Throw. The throw is caught by `handleJsonPointerCommand` and logged by `ShipRoom`, so a buggy client can't crash the server. |

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

Each pointer string corresponds to a target field that must satisfy
one of the three admission clauses above. The first round of
`@commandable()` annotations covers fields exercised directly by the
existing CI suite (`Spaceship.angle`, `SystemState.power`,
`Magazine.capacity`). The GM tweak panel is covered implicitly by the
`@tweakable` and `DesignState` clauses. A follow-up sweep (Phase B)
marks the remaining browser-driven _player_ command fields (e.g.,
`/smartPilot/rotation`, `/warp/levelUpCommand`, `/chainGun/isFiring`)
as `@commandable()` and removes warn-only mode entirely.

## Why a whitelist instead of `Reflect.set` everywhere

The previous behavior was to `Reflect.set` any RFC-6901-valid path. That
made every new `@gameField` accidentally remote-writable, including
fields that exist purely as server-side mirror state. A typo or
malicious client could rewrite simulation invariants. The whitelist
makes the remote surface explicit, grep-able, and code-reviewable.
