# JSON Pointer command surface

The JSON Pointer setter (`modules/core/src/json-ptr.ts`,
`handleJsonPointerCommand` in `modules/core/src/commands.ts`) is the
generic mechanism the browser, Node-RED, and external integrations use
to mutate ship and space state at runtime. RFC 6901 syntax is validated
on the wire, but the actual write target (a `@gameField` somewhere on a
`Schema` subclass) is **not** automatically remotely writable.

`isCommandable` in `modules/core/src/game-field.ts` is the single
admission predicate. A write is allowed if **any** of five categories
match:

1. **`@commandable()`** — an explicit, grep-able player-command surface.
   Used for helm input, weapon fire, subsystem mode commands, etc.
2. **`@commandable({ '/x': true })`** on an ancestor property — admits
   a specific sub-pointer write through a nested Schema type (see
   "Descendant admission" below).
3. **`@tweakable`** — any field annotated for the GM tweak panel is
   implicitly commandable (see "GM direct-control surface" below).
4. **`@defectible`** — the GM tweak panel renders a writable slider for
   every defectible system-health factor, so those fields are implicitly
   commandable too (see "GM direct-control surface" below).
5. **`DesignState` subclass** — every field on any `FooDesignState`
   class is implicitly commandable so the GM design-state panel can
   live-edit subsystem constants.

Non-admitted writes **always throw** — there is no warn-only mode.
The throw is caught by `handleJsonPointerCommand` and logged by
`ShipRoom`, so a buggy client can't crash the server.

## Descendant admission

Some Schema types use nested sub-Schemas as compound values (e.g.,
`SmartPilot.maneuvering` is a `Vec2` with `.x` and `.y`). The JSON
Pointer path to `maneuvering.x` is `/smartPilot/maneuvering/x`. The
leaf node `Vec2.x` has no `@commandable()` of its own; instead, its
parent property declares which sub-paths are admitted:

```ts
// In smart-pilot.ts
@commandable({ '/x': true, '/y': true })
@range({ '/x': [-1, 1], '/y': [-1, 1] })
@gameField(Vec2)
maneuvering: Vec2 = new Vec2(0, 0);
```

When `JsonPointer.set` encounters a non-admitted leaf, it walks up the
path looking for a parent property that holds a matching descendant
admission. This mirrors the `@range` / `@rangeSchema` ancestor-walk
pattern in `modules/core/src/range.ts`.

The class-level variant mirrors `rangeSchema`:

```ts
@commandableSchema({ '/maneuvering/x': true, '/maneuvering/y': true })
class SmartPilot extends Schema { ... }
```

Both decorators are imported from `modules/core/src/game-field.ts`.

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
    public power = PowerLevel.NORMAL;
}
```

The decorator must be invoked with parentheses (`@commandable()`, not
`@commandable`). The Colyseus Unity codegen tool only understands
CallExpression decorators on `@gameField` properties; a bare-identifier
decorator crashes its parser. The same rule applies to
`@commandableSchema(...)`.

A bare `@gameField` is still synced **server → client** (read-only from
the client's point of view). Only admitted fields participate in the
**client → server** command surface.

`@commandable` walks the prototype chain, so subclasses inherit
allowlists from their parent classes.

## GM direct-control surface

The GM tweak panel is the game-running tool. It is **not** an edge case:
it is how scenarios are actually run, and it expects direct control over
ship and space-object state during a live session. Two browser widgets
produce the writes:

- **`modules/browser/src/widgets/tweak.ts`** — calls `getTweakables(state)`
  and wires every `@tweakable` field on the currently-selected schema
  subject to `readWriteProp` / `readWriteNumberProp`. Pointer strings
  look like `${systemPointer}/${field}`. Mounted only on
  `modules/browser/src/screens/gm.ts`. The same widget also renders a
  writable slider per `@defectible` factor of every ship system
  (`system.defectibles`), so those fields must be admitted as well.
- **`modules/browser/src/widgets/design-state.ts`** — for every
  subsystem that has a `design = new FooDesignState()` field, walks the
  `DesignState` subclass dynamically via `DesignState.keys()` and
  wires each key to `readWriteProp` at pointer
  `${system}/design/${constName}`. Mounted on `screens/gm.ts` and also
  on the `screens/ship.ts` "Empty Screen" dashboard.

`isCommandable` admits these categories without requiring per-field
annotation. The `@tweakable` check reuses the existing
`tweakablePropertyMetadataKey` symbol from
`modules/core/src/tweakable.ts`. The `@defectible` check reads the
`DEFECTIBLE_METADATA` key — a registered symbol
(`Symbol.for('starwards.defectible')`) defined in `game-field.ts` and
imported by `ship/system.ts`'s `defectible` decorator; defining it in
`game-field.ts` lets `isCommandable` read it without importing
`ship/system.ts`. The `DesignState` check uses a static marker
(`static readonly isStarwardsDesignState = true`) on the abstract base
class; JavaScript inherits class statics through `extends`, so every
concrete subclass carries it for free. Both indirections avoid a
dependency cycle (`range.ts` imports from `json-ptr.ts`, and
`ship/system.ts` imports from `../range` and `../game-field`).

### Limitation: shared room channel

Today's `ShipRoom` has no connection-level GM-vs-player identity
(`modules/server/src/ship/room.ts` defines no `onAuth`, no client-type
field). GM and player clients join the same room and send through the
same `onMessage('*')` handler. The whitelist's value in today's
architecture is **accidental-exposure protection**: a contributor who
adds a bare `@gameField` for sync purposes does NOT get a wire-write
handle for free. Narrowing the player attack surface relative to the
GM's is a non-goal — see "Non-goal: malicious-player isolation" in
`docs/maintainers.md`.

## Adding a new commandable property

1. Decide whether the field is server-internal (sync only), client-input
   (commandable), or both. If unclear, leave it sync-only and add
   `@commandable` later when a real send site appears.
2. For a leaf scalar: add `@commandable()` adjacent to `@gameField`.
3. For a nested Schema value (e.g., Vec2): add
   `@commandable({ '/x': true, '/y': true })` on the parent property
   (or use `@commandableSchema({ '/prop/x': true })` on the class).
4. Add an E2E hotkey test (or unit test for non-keyboard inputs) that
   exercises the pointer and asserts the state change.

## Node-RED and external integrations

Node-RED flows and external integrations write state through the same
`handleJsonPointerCommand` path and are subject to the same whitelist.
Target only `@commandable`, `@tweakable`, `@defectible`, or `DesignState`
fields. A write to an unannotated field will throw and the error will be
logged by `ShipRoom`.

## Auditing send sites

```bash
# Browser screens
grep -rn "writeProp\|readWriteProp\|readWriteNumberProp" modules/browser/src

# Node-RED
grep -rn "sendJsonCmd" modules/node-red/src
```

Each pointer string corresponds to a target field that must satisfy
one of the five admission clauses above.

## Why a whitelist instead of `Reflect.set` everywhere

The previous behavior was to `Reflect.set` any RFC-6901-valid path. That
made every new `@gameField` accidentally remote-writable, including
fields that exist purely as server-side mirror state. A typo or
malicious client could rewrite simulation invariants. The whitelist
makes the remote surface explicit, grep-able, and code-reviewable.
