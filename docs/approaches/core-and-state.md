# State, decorators and events

How game state is declared, synchronised, introspected and constructed — the techniques behind `@gameField`, the decorator metadata layer, event plumbing and object construction.

## Core Game Architecture

1. **Colyseus Schema with Custom Decorator**
    - [`@gameField`](../../modules/core/src/game-field.ts) decorator wraps Colyseus `@type`
    - Automatic float32 rounding to 2 decimals for bandwidth optimization
    - Runtime serialization with TypeScript type safety

2. **JSON Pointer Command System**
    - [RFC 6901 JSON Pointers](../../modules/core/src/json-ptr.ts) as command identifiers
    - [`handleJsonPointerCommand`](../../modules/core/src/commands.ts) wildcard routing
    - Direct state tree manipulation without explicit command handlers
    - Pointer instance caching for performance

3. **Dual State Synchronization**
    - Server-authoritative [`SpaceObject`](../../modules/core/src/space/space-object-base.ts)
    - Separate [`ShipState`](../../modules/core/src/ship/ship-state.ts) for network sync
    - Manual [`syncShipProperties`](../../modules/core/src/ship/ship-manager-abstract.ts) selective copying
    - Server-only calculations without network overhead

4. **Design vs State Separation**
    - [`DesignState`](../../modules/core/src/ship/system.ts) for immutable configuration
    - Runtime state separate from design properties
    - Design persists through respawn; state resets
    - Ship templates and loadout system

5. **WeakMap-Based Object Lifecycle**
    - [`collisionToState`](../../modules/core/src/logic/space-manager.ts) and [`stateToExtraData`](../../modules/core/src/logic/space-manager.ts)
    - Automatic garbage collection without manual cleanup
    - Association of collision bodies with game state
    - Memory leak prevention

## Metadata & Reflection

6. **Reflect Metadata for Runtime Introspection**
    - [`@tweakable`](../../modules/core/src/tweakable.ts) for UI configuration
    - [`@range`](../../modules/core/src/range.ts) for value constraints
    - Property decorators on class prototypes
    - Dynamic and static constraint support

7. **Symbol-Based Metadata Keys**
    - [`Symbol()`](../../modules/core/src/range.ts) instead of strings for metadata keys
    - Prevents property name collisions
    - Type-safe metadata access
    - `tweakablePropertyMetadataKey`, `propertyMetadataKey`, `descendantMetadataKey`

8. **Range Ancestor Traversal**
    - [`rangeSchema`](../../modules/core/src/range.ts) defines constraints on nested descendants
    - Ranges propagate from parent to child objects
    - [`tryGetRange`](../../modules/core/src/range.ts) walks ancestor chain
    - Dynamic range calculation via functions

9. **Traverse System for Schema Introspection**
    - [`allColyseusProperties`](../../modules/core/src/traverse.ts) generator
    - Yields `[container, namespace, field, value]` tuples
    - Handles ArraySchema, MapSchema, SetSchema
    - Generic serialization and debugging

## Type Safety & Patterns

10. **Type Guard Pattern**
    - Static [`isInstance`](../../modules/core/src/space/spaceship.ts) methods on all entity types
    - Runtime type checking for polymorphic collections
    - Narrowing for TypeScript type system
    - Alternative to `instanceof` for schema objects

11. **DeepReadonly Wrapper**
    - [`DeepReadonly<T>`](../../modules/core/src/ship/ship-manager-abstract.ts) from ts-essentials
    - Prevents accidental mutation of authoritative state
    - Managers reference read-only space objects
    - Compile-time enforcement

12. **Enum-Based State Representation**
    - [`Faction`](../../modules/core/src/space/faction.ts), [`Order`](../../modules/core/src/ship/ship-state.ts), [`IdleStrategy`](../../modules/core/src/ship/ship-state.ts)
    - Type-safe state values
    - Network-efficient int8 serialization
    - Exhaustiveness checking with [`assertUnreachable`](../../modules/core/src/utils.ts)

13. **Constructor Type Pattern**
    - [`Constructor`](../../modules/core/src/range.ts) type for Schema classes
    - Enables decorator functions to access class prototype
    - Type-safe class manipulation
    - Metadata on prototype chain

## Event Systems

14. **Event-Driven State Synchronization**
    - [`colyseus-events`](../../modules/core/src/events.ts) library
    - JSON pointer paths as event names
    - [`onChange`](../../modules/browser/src/property-wrappers.ts) callbacks
    - Automatic UI updates

15. **Property Wrapper Pattern**
    - [`readProp`](../../modules/browser/src/property-wrappers.ts), [`writeProp`](../../modules/browser/src/property-wrappers.ts), [`readWriteProp`](../../modules/browser/src/property-wrappers.ts)
    - [`getValue`](../../modules/browser/src/property-wrappers.ts) and [`setValue`](../../modules/browser/src/property-wrappers.ts) methods
    - [`onChange`](../../modules/browser/src/property-wrappers.ts) subscription
    - Range information for numeric properties

16. **Aggregate Property Pattern**
    - [`aggregate`](../../modules/browser/src/property-wrappers.ts) combines multiple properties
    - Change detection on computed value
    - Efficient update propagation
    - Deduplication of identical values

17. **Destructor Pattern for Cleanup**
    - [`Destructors`](../../modules/core/src/utils.ts) class accumulates cleanup functions
    - [`destroy`](../../modules/browser/src/property-wrappers.ts) calls all registered destructors
    - Prevents memory leaks in event subscriptions
    - RAII-like pattern in TypeScript

18. **Event Wildcard Pattern**
    - [`'**'`](../../modules/core/src/client/driver.ts) listens to all nested events
    - [`'*'`](../../modules/core/src/client/driver.ts) listens to direct events
    - Hierarchical event bubbling
    - Game state change monitoring

## Data Structures & Utilities

19. **Iterator-Based Utilities**
    - Custom [`Iterator`](../../modules/core/src/logic/iteration.ts) class
    - [`elementAfter`](../../modules/core/src/logic/iteration.ts) / `elementBefore` for circular iteration
    - Target cycling in combat
    - Lazy evaluation with chaining

20. **Task Loop with Error Recovery**
    - [`TaskLoop`](../../modules/core/src/task-loop.ts) wraps async tasks
    - Automatic retry on error without crash
    - [`start`](../../modules/core/src/task-loop.ts) and [`stop`](../../modules/core/src/task-loop.ts) methods
    - Configurable pause interval

21. **Updateable Interface Pattern**
    - [`Updateable`](../../modules/core/src/updateable.ts) interface
    - [`IterationData`](../../modules/core/src/updateable.ts) with delta time
    - Frame-rate independent updates
    - Composition through object graph

22. **Generator-Based Traversal**
    - Generators for lazy iteration (`function*`)
    - [`yield`](../../modules/core/src/traverse.ts) for on-demand values
    - Memory-efficient large collections
    - Used for damage resolution, collision queries

23. **Circular JSON Pointer Cache**
    - [`Map<string, JsonPointer>`](../../modules/core/src/json-ptr.ts) cache
    - Regex validation before caching
    - [`getJsonPointer`](../../modules/core/src/json-ptr.ts) with fallback
    - Performance optimization for repeated lookups

## Factory & Initialization Patterns

24. **Factory Pattern with Builder Initialization**
    - [`makeShipState`](../../modules/core/src/ship/make-ship-state.ts) constructs ships
    - Fluent [`init()`](../../modules/core/src/space/spaceship.ts) returns `this`
    - Separation of construction from configuration
    - Type-safe design objects

25. **Design Data as Configuration**
    - [`ShipDesign`](../../modules/core/src/configurations/demo-ship.ts) plain objects
    - Tuples for directional components
    - [`ShipDirectionConfig`](../../modules/core/src/ship/ship-direction.ts) string aliases
    - JSON-serializable ship templates

26. **Array Schema Initialization**
    - [`ArraySchema<T>`](../../modules/core/src/ship/ship-state.ts) from Colyseus
    - [`setAt`](../../modules/core/src/ship/make-ship-state.ts) for indexed assignment
    - Network-synchronized arrays
    - Type-safe element access

27. **System Reset Functions**
    - [`resetShipState`](../../modules/core/src/ship/ship-manager-abstract.ts) restores initial state
    - [`resetThruster`](../../modules/core/src/ship/ship-manager-abstract.ts) per-system
    - Called on ship spawn
    - Consistent initial conditions
