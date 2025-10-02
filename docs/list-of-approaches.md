
## List of Architectural Approaches

### Core Game Architecture

1. **Colyseus Schema with Custom Decorator**
   - [`@gameField`](modules/core/src/game-field.ts:16) decorator wraps Colyseus `@type`
   - Automatic float32 rounding to 2 decimals for bandwidth optimization
   - Runtime serialization with TypeScript type safety

2. **JSON Pointer Command System**
   - [RFC 6901 JSON Pointers](modules/core/src/json-ptr.ts:1) as command identifiers
   - [`handleJsonPointerCommand`](modules/core/src/commands.ts:90) wildcard routing
   - Direct state tree manipulation without explicit command handlers
   - Pointer instance caching for performance

3. **Dual State Synchronization**
   - Server-authoritative [`SpaceObject`](modules/core/src/space/space-object-base.ts:1)
   - Separate [`ShipState`](modules/core/src/ship/ship-state.ts:52) for network sync
   - Manual [`syncShipProperties`](modules/core/src/ship/ship-manager-abstract.ts:272) selective copying
   - Server-only calculations without network overhead

4. **Design vs State Separation**
   - [`DesignState`](modules/core/src/ship/system.ts:1) for immutable configuration
   - Runtime state separate from design properties
   - Design persists through respawn; state resets
   - Ship templates and loadout system

5. **WeakMap-Based Object Lifecycle**
   - [`collisionToState`](modules/core/src/logic/space-manager.ts:66) and [`stateToExtraData`](modules/core/src/logic/space-manager.ts:67)
   - Automatic garbage collection without manual cleanup
   - Association of collision bodies with game state
   - Memory leak prevention

### Metadata & Reflection

6. **Reflect Metadata for Runtime Introspection**
   - [`@tweakable`](modules/core/src/tweakable.ts:38) for UI configuration
   - [`@range`](modules/core/src/range.ts:39) for value constraints
   - Property decorators on class prototypes
   - Dynamic and static constraint support

7. **Symbol-Based Metadata Keys**
   - [`Symbol()`](modules/core/src/range.ts:8) instead of strings for metadata keys
   - Prevents property name collisions
   - Type-safe metadata access
   - `tweakablePropertyMetadataKey`, `propertyMetadataKey`, `descendantMetadataKey`

8. **Range Ancestor Traversal**
   - [`rangeSchema`](modules/core/src/range.ts:24) defines constraints on nested descendants
   - Ranges propagate from parent to child objects
   - [`tryGetRange`](modules/core/src/range.ts:90) walks ancestor chain
   - Dynamic range calculation via functions

9. **Traverse System for Schema Introspection**
   - [`allColyseusProperties`](modules/core/src/traverse.ts:17) generator
   - Yields `[container, namespace, field, value]` tuples
   - Handles ArraySchema, MapSchema, SetSchema
   - Generic serialization and debugging

### Physics & Space Management

10. **Spatial Indexing with Collision Detection**
    - [`detect-collisions`](modules/core/src/logic/space-manager.ts:2) library
    - Deferred updates via [`toUpdateCollisions`](modules/core/src/logic/space-manager.ts:75) Set
    - Batch processing to minimize index rebuilds
    - Broadphase collision optimization

11. **Clique-Based Attachment System**
    - [`attachments`](modules/core/src/logic/space-manager.ts:68) Map for docking
    - [`calcAttachmentCliques`](modules/core/src/logic/space-manager.ts:142) transitive closure
    - All attached objects move as unit
    - Carrier and formation support

12. **Raycast Optimization for Projectiles**
    - [`raycast`](modules/core/src/logic/space-manager.ts:413) pre-checks collision path
    - Prevents projectiles from tunneling through objects
    - Filter callback for collision eligibility
    - Early termination on hit

13. **Time-Based Garbage Collection**
    - [`gc()`](modules/core/src/logic/space-manager.ts:168) runs every 5 seconds
    - Batch cleanup of destroyed objects
    - [`secondsSinceLastGC`](modules/core/src/logic/space-manager.ts:76) counter
    - Reduces map lookup overhead

14. **Batch Collision Updates**
    - [`toUpdateCollisions`](modules/core/src/logic/space-manager.ts:75) Set aggregates changes
    - Single [`collisions.update()`](modules/core/src/logic/space-manager.ts:610) call per frame
    - Minimizes spatial index rebuilds
    - Position changes batched together

15. **Field of View with Lazy Evaluation**
    - [`FieldOfView`](modules/core/src/logic/field-of-view.ts:1) tracks faction visibility
    - Marked dirty and recomputed only when needed
    - Fog of war implementation
    - Prevents client-side cheating

16. **Client-Side Spatial Index Mirror**
    - [`SpatialIndex`](modules/browser/src/radar/spatial-index.ts:16) mirrors server collision system
    - [`WeakMap`](modules/browser/src/radar/spatial-index.ts:5) singleton per driver
    - Event-driven updates via [`on('$add')`](modules/browser/src/radar/spatial-index.ts:51)
    - Efficient client-side queries

### Damage & Combat Systems

17. **Probabilistic Damage System**
    - [`NormalDistribution`](modules/core/src/ship/damage-manager.ts:22) for hit probability
    - [`damage50`](modules/core/src/ship/damage-manager.ts:89) as median damage threshold
    - CDF-based probability calculation
    - Randomized but balanced outcomes

18. **Arc-Based Damage Distribution**
    - [`shipAreasInRange`](modules/core/src/ship/damage-manager.ts:58) determines hit zones
    - [`archIntersection`](modules/core/src/ship/damage-manager.ts:60) calculates overlap
    - Armor plates by angular position
    - Directional damage modeling

19. **System Degradation Pattern**
    - Systems have effectiveness factors that accumulate damage
    - [`efficiency`](modules/core/src/ship/heat-manager.ts:1), `malfunctionRangeFactor`, `angleError`
    - Gradual performance loss vs instant failure
    - Repair vs replace decisions

20. **Predictive Hit Location Algorithm**
    - [`predictHitLocation`](modules/core/src/logic/gunner-assist.ts:44) iterative refinement
    - Accounts for bullet travel time and target motion
    - Converges on intercept point
    - Handles edge cases (max iterations, distance checks)

21. **Kill Zone Calculation**
    - [`getKillZoneRadiusRange`](modules/core/src/logic/gunner-assist.ts:82) determines effective range
    - Accounts for explosion radius and spread
    - [`isTargetInKillZone`](modules/core/src/logic/gunner-assist.ts:92) validates firing solution
    - Prevents wasted ammunition

### Energy & Resource Management

22. **Energy Per Minute (EPM) Tracking**
    - [`EpmEntry`](modules/core/src/ship/energy-manager.ts:8) accumulates energy usage
    - Weighted average calculation with decay
    - [`SECONDS_IN_MINUTE`](modules/core/src/ship/energy-manager.ts:12) normalization
    - Per-system energy monitoring

23. **Heat Management with Proportional Coolant**
    - [`HeatManager`](modules/core/src/ship/heat-manager.ts:8) distributes coolant by factor
    - [`coolantFactor`](modules/core/src/ship/heat-manager.ts:38) per system
    - Even distribution when all factors zero
    - Overheat causes damage at [`MAX_SYSTEM_HEAT`](modules/core/src/ship/heat-manager.ts:7)

24. **Try-Spend Energy Pattern**
    - [`trySpendEnergy`](modules/core/src/ship/energy-manager.ts:21) returns boolean success
    - Automatically generates heat for high-drain systems
    - Energy threshold before heat generation
    - Prevents negative energy values

25. **Afterburner Fuel System**
    - Separate fuel pool from main energy
    - [`maxAfterBurnerFuel`](modules/core/src/ship/maneuvering.ts:1) capacity
    - Recharges over time using energy
    - Speed boost proportional to fuel usage

### Ship Management & Control

26. **Manager Pattern with Dependency Injection**
    - Abstract [`ShipManager`](modules/core/src/ship/ship-manager-abstract.ts:69)
    - [`ShipManagerPc`](modules/core/src/ship/ship-manager.ts:20) and [`ShipManagerNpc`](modules/core/src/ship/ship-manager.ts:92) specializations
    - [`internalProxy`](modules/core/src/ship/ship-manager-abstract.ts:70) for late binding
    - Energy system injected post-construction

27. **States Toggle Pattern**
    - [`StatesToggle`](modules/core/src/logic/states-toggle.ts:1) cycles through legal states
    - [`setLegalState`](modules/core/src/logic/states-toggle.ts:35) dynamically enables/disables options
    - Skips illegal states when toggling
    - Callback on state change

28. **Automation Manager State Machine**
    - [`AutomationManager`](modules/core/src/ship/automation-manager.ts:28) handles AI behaviors
    - [`Order`](modules/core/src/ship/ship-state.ts:35) enum (MOVE, ATTACK, FOLLOW)
    - Task execution with cancellation
    - [`currentTask`](modules/core/src/ship/ship-state.ts:75) string for UI display

29. **Smart Pilot Modes**
    - [`SmartPilotMode`](modules/core/src/ship/smart-pilot.ts:1) enum (VELOCITY, TARGET, DIRECT)
    - Separate rotation and maneuvering modes
    - Mode determines control interpretation
    - Dynamic mode switching based on target availability

30. **Helm Assist Functions**
    - [`moveToTarget`](modules/core/src/logic/helm-assist.ts:35) calculates boost/strafe
    - [`rotateToTarget`](modules/core/src/logic/helm-assist.ts:45) determines rotation
    - [`accelerateToPosition`](modules/core/src/logic/helm-assist.ts:63) with overshoot prevention
    - Physics-based movement prediction

31. **Docking State Management**
    - [`DockingMode`](modules/core/src/ship/docking.ts:1) enum (DOCKED, DOCKING, UNDOCKING)
    - [`DockingManager`](modules/core/src/ship/docking-manager.ts:1) handles transitions
    - Distance and angle threshold checks
    - Attachment system integration

### Type Safety & Patterns

32. **Type Guard Pattern**
    - Static [`isInstance`](modules/core/src/space/spaceship.ts:9) methods on all entity types
    - Runtime type checking for polymorphic collections
    - Narrowing for TypeScript type system
    - Alternative to `instanceof` for schema objects

33. **DeepReadonly Wrapper**
    - [`DeepReadonly<T>`](modules/core/src/ship/ship-manager-abstract.ts:23) from ts-essentials
    - Prevents accidental mutation of authoritative state
    - Managers reference read-only space objects
    - Compile-time enforcement

34. **Enum-Based State Representation**
    - [`Faction`](modules/core/src/space/faction.ts:1), [`Order`](modules/core/src/ship/ship-state.ts:35), [`IdleStrategy`](modules/core/src/ship/ship-state.ts:29)
    - Type-safe state values
    - Network-efficient int8 serialization
    - Exhaustiveness checking with [`assertUnreachable`](modules/core/src/utils.ts:1)

35. **Constructor Type Pattern**
    - [`Constructor`](modules/core/src/range.ts:14) type for Schema classes
    - Enables decorator functions to access class prototype
    - Type-safe class manipulation
    - Metadata on prototype chain

### Event Systems

36. **Event-Driven State Synchronization**
    - [`colyseus-events`](modules/core/src/events.ts:1) library
    - JSON pointer paths as event names
    - [`onChange`](modules/browser/src/property-wrappers.ts:14) callbacks
    - Automatic UI updates

37. **Property Wrapper Pattern**
    - [`readProp`](modules/browser/src/property-wrappers.ts:65), [`writeProp`](modules/browser/src/property-wrappers.ts:93), [`readWriteProp`](modules/browser/src/property-wrappers.ts:86)
    - [`getValue`](modules/browser/src/property-wrappers.ts:70) and [`setValue`](modules/browser/src/property-wrappers.ts:94) methods
    - [`onChange`](modules/browser/src/property-wrappers.ts:71) subscription
    - Range information for numeric properties

38. **Aggregate Property Pattern**
    - [`aggregate`](modules/browser/src/property-wrappers.ts:16) combines multiple properties
    - Change detection on computed value
    - Efficient update propagation
    - Deduplication of identical values

39. **Destructor Pattern for Cleanup**
    - [`Destructors`](modules/browser/src/property-wrappers.ts:28) class accumulates cleanup functions
    - [`destroy`](modules/browser/src/property-wrappers.ts:41) calls all registered destructors
    - Prevents memory leaks in event subscriptions
    - RAII-like pattern in TypeScript

40. **Event Wildcard Pattern**
    - [`'**'`](modules/core/src/client/driver.ts:123) listens to all nested events
    - [`'*'`](modules/core/src/client/driver.ts:113) listens to direct events
    - Hierarchical event bubbling
    - Game state change monitoring

### Network & Client Management

41. **Connection Manager State Machine**
    - [`ConnectionManager`](modules/core/src/client/connection-manager.ts:1) handles reconnection
    - Typed [`ConnectionStateEvent`](modules/core/src/client/driver.ts:3) transitions
    - Exponential backoff for reconnects
    - Room lifecycle hooks

42. **Room Lifecycle Hooks**
    - [`hookRoomLifecycle`](modules/core/src/client/driver.ts:39) registers cleanup
    - Automatic room leave on disconnect
    - Error propagation to connection manager
    - [`onLeave`](modules/core/src/client/driver.ts:51) handlers

43. **Lazy Driver Initialization**
    - Drivers created on-demand via [`getShipDriver`](modules/core/src/client/driver.ts:194)
    - [`Promise<Driver>`](modules/core/src/client/driver.ts:35) caching
    - Wait for ship existence before connecting
    - Prevents premature connections

44. **Infinite Iterator Pattern**
    - [`getUniqueShipIds`](modules/core/src/client/driver.ts:160) async generator
    - Yields new ships as they appear
    - Tracks seen ships in Set
    - Runs until client destroyed

45. **Game State Change Observer**
    - [`onGameStateChange`](modules/core/src/client/driver.ts:101) callback registration
    - Automatic re-subscription on reconnect
    - Cleanup function returned
    - Error handling with silent catch

### Data Structures & Utilities

46. **Iterator-Based Utilities**
    - Custom [`Iterator`](modules/core/src/logic/iteration.ts:1) class
    - [`elementAfter`](modules/core/src/logic/iteration.ts:1) / `elementBefore` for circular iteration
    - Target cycling in combat
    - Lazy evaluation with chaining

47. **Task Loop with Error Recovery**
    - [`TaskLoop`](modules/core/src/task-loop.ts:1) wraps async tasks
    - Automatic retry on error without crash
    - [`start`](modules/core/src/task-loop.ts:24) and [`stop`](modules/core/src/task-loop.ts:30) methods
    - Configurable pause interval

48. **Updateable Interface Pattern**
    - [`Updateable`](modules/core/src/updateable.ts:6) interface
    - [`IterationData`](modules/core/src/updateable.ts:1) with delta time
    - Frame-rate independent updates
    - Composition through object graph

49. **Generator-Based Traversal**
    - Generators for lazy iteration (`function*`)
    - [`yield`](modules/core/src/traverse.ts:6) for on-demand values
    - Memory-efficient large collections
    - Used for damage resolution, collision queries

50. **Circular JSON Pointer Cache**
    - [`Map<string, JsonPointer>`](modules/core/src/json-ptr.ts:5) cache
    - Regex validation before caching
    - [`getJsonPointer`](modules/core/src/json-ptr.ts:12) with fallback
    - Performance optimization for repeated lookups

### Factory & Initialization Patterns

51. **Factory Pattern with Builder Initialization**
    - [`makeShipState`](modules/core/src/ship/make-ship-state.ts:126) constructs ships
    - Fluent [`init()`](modules/core/src/space/spaceship.ts:33) returns `this`
    - Separation of construction from configuration
    - Type-safe design objects

52. **Design Data as Configuration**
    - [`ShipDesign`](modules/core/src/configurations/dragonfly-sf-22.ts:1) plain objects
    - Tuples for directional components
    - [`ShipDirectionConfig`](modules/core/src/ship/ship-direction.ts:1) string aliases
    - JSON-serializable ship templates

53. **Array Schema Initialization**
    - [`ArraySchema<T>`](modules/core/src/ship/ship-state.ts:78) from Colyseus
    - [`setAt`](modules/core/src/ship/make-ship-state.ts:130) for indexed assignment
    - Network-synchronized arrays
    - Type-safe element access

54. **System Reset Functions**
    - [`resetShipState`](modules/core/src/ship/ship-manager-abstract.ts:40) restores initial state
    - [`resetThruster`](modules/core/src/ship/ship-manager-abstract.ts:54) per-system
    - Called on ship spawn
    - Consistent initial conditions

### Build System & Tooling

55. **Monorepo with Shared Path Mapping**
    - [`@starwards/*`](tsconfig.json:42) aliases to module locations
    - Import from source or compiled output
    - Independent module build systems
    - Core published to npm; others private

56. **Multiple Build Outputs**
    - Tsup for CommonJS library output
    - Webpack for browser bundles
    - Rollup for Node-RED editor
    - TypeScript compilation for server

57. **Concurrent Build Scripts**
    - [`concurrently`](package.json:69) runs multiple builds
    - `--kill-others-on-fail` stops all on error
    - Color-coded output per module
    - Parallel compilation

58. **Incremental TypeScript Compilation**
    - [`incremental: true`](tsconfig.json:67) in tsconfig
    - `.tsbuildinfo` file caching
    - Faster subsequent builds
    - Dependency tracking

59. **Source Maps for Debugging**
    - [`sourceMap: true`](tsconfig.json:12) in tsconfig
    - `.map` files for browser debugging
    - Original TypeScript in dev tools
    - Production debugging capability

60. **Path Alias Resolution**
    - [`paths`](tsconfig.json:41) in tsconfig
    - [`baseUrl: "."`](tsconfig.json:40) for relative resolution
    - Module imports without `../..`
    - Better refactoring support

### Code Quality & Linting

61. **No Console.log in Production**
    - ESLint [`'no-console': 'error'`](.eslintrc.js:20)
    - Explicit `// eslint-disable-next-line` required
    - Prevents debug output leaks
    - Enforces proper logging

62. **Sort Imports Rule**
    - ESLint [`'sort-imports': 'error'`](.eslintrc.js:18)
    - Alphabetically sorted imports
    - Consistent code style
    - Easier merge conflicts

63. **No Shadow Variables**
    - [`'@typescript-eslint/no-shadow': 'error'`](.eslintrc.js:40)
    - Prevents variable name reuse
    - Reduces confusion
    - Catches common bugs

64. **No Only Tests**
    - [`'no-only-tests/no-only-tests': 'error'`](.eslintrc.js:19)
    - Prevents `.only` in test commits
    - Ensures full test suite runs
    - CI/CD safety

65. **Prettier Integration**
    - [`'prettier/prettier': 'error'`](.eslintrc.js:24)
    - Formatting as lint error
    - Consistent code style
    - Auto-fix on save

66. **Trailing Comma Enforcement**
    - [`'comma-dangle': ['error', 'always-multiline']`](.eslintrc.js:44)
    - Cleaner git diffs
    - Easier array/object additions
    - Consistent style

67. **React Hooks Validation**
    - [`'react-hooks/rules-of-hooks': 'error'`](.eslintrc.js:21)
    - [`'react-hooks/exhaustive-deps': 'error'`](.eslintrc.js:22)
    - Prevents hook violations
    - Dependency array validation

68. **TypeScript Strict Mode**
    - [`strict: true`](tsconfig.json:24)
    - [`noImplicitReturns`](tsconfig.json:35)
    - [`noUnusedLocals`](tsconfig.json:33)
    - [`noFallthroughCasesInSwitch`](tsconfig.json:36)

### Git Workflow & Hooks

69. **Husky Git Hooks**
    - Pre-commit hooks in `.husky/`
    - Automatic setup after install
    - Enforces code quality
    - Prevents bad commits

70. **Lint-Staged Pre-commit**
    - [`lint-staged`](package.json:41) runs on staged files only
    - Prettier formatting
    - ESLint with auto-fix
    - Fast pre-commit checks

71. **Pretty-Quick for Speed**
    - [`pretty-quick`](package.json:17) formats only changed files
    - Faster than full project format
    - Git-aware file selection
    - Pre-commit optimization

### UI & Browser Patterns

72. **Golden Layout for Docking**
    - [`golden-layout`](modules/browser/package.json:29) library
    - Draggable, resizable panels
    - Layout persistence to localStorage
    - Multi-monitor support

73. **Tweakpane Runtime Configuration**
    - [`tweakpane`](modules/browser/package.json:38) for debugging
    - [`@tweakable`](modules/core/src/tweakable.ts:38) decorator integration
    - Runtime value adjustment
    - Developer tools UI

74. **PixiJS Rendering**
    - [`pixi.js`](modules/browser/package.json:33) for 2D graphics
    - Layer-based rendering
    - Sprite pooling for performance
    - WebGL acceleration

75. **Arwes Sci-fi UI**
    - [`@arwes/core`](modules/browser/package.json:16) component library
    - Consistent futuristic theme
    - Animation support
    - Sound effects integration

76. **React 17 without Imports**
    - [`"jsx": "react"`](tsconfig.json:9) in tsconfig
    - No `import React` needed
    - Cleaner component files
    - Automatic JSX transform

77. **Hotkeys.js for Shortcuts**
    - [`hotkeys-js`](modules/browser/package.json:30) library
    - Global keyboard shortcuts
    - Context-aware bindings
    - Game controls

78. **WebFont Loader**
    - [`webfontloader`](modules/browser/package.json:40) for custom fonts
    - Async font loading
    - FOUT prevention
    - Loading state management

79. **CSS Element Queries**
    - [`css-element-queries`](modules/browser/package.json:26)
    - Container-based responsive design
    - Panel resize handling
    - Alternative to media queries

80. **D3 for Visualizations**
    - [`d3`](modules/browser/package.json:27) library
    - Data-driven graphics
    - Tactical displays
    - Chart generation

### Testing Strategies

81. **Property-Based Testing**
    - [`fast-check`](package.json:80) library
    - Generative testing
    - Edge case discovery
    - Invariant validation

82. **Test Factories**
    - [`test-factories.ts`](modules/core/test/test-factories.ts:1)
    - Reusable test data builders
    - Consistent test setup
    - Reduced duplication

83. **Test Harnesses**
    - [`ship-test-harness.ts`](modules/core/test/ship-test-harness.ts:1)
    - Complex scenario setup
    - State verification helpers
    - Integration test support

84. **Playwright E2E**
    - [`@playwright/test`](package.json:49)
    - Browser automation
    - Visual regression testing
    - Multi-browser support

85. **Jest with esbuild**
    - [`@jgoz/jest-esbuild`](package.json:48)
    - Fast TypeScript transformation
    - No tsc overhead
    - Quick test iterations

86. **Jest JUnit Reporter**
    - [`jest-junit`](package.json:86)
    - CI/CD integration
    - Test result reporting
    - Jenkins/TeamCity support

### Server & Deployment

87. **Colyseus Server Framework**
    - [`colyseus`](modules/server/package.json:21) server
    - Room-based architecture
    - State synchronization
    - Multiplayer support

88. **Express Middleware**
    - [`express`](modules/server/package.json:22) server
    - Static file serving
    - API endpoints
    - Admin routes

89. **Express Basic Auth**
    - [`express-basic-auth`](modules/server/package.json:24)
    - Simple authentication
    - Admin protection
    - No complex auth setup

90. **Colyseus Monitor**
    - [`@colyseus/monitor`](modules/server/package.json:19)
    - Room inspection
    - Live player counts
    - Debug interface

91. **Development vs Production**
    - [`dev.ts`](modules/server/src/dev.ts:1) and [`prod.ts`](modules/server/src/prod.ts:1)
    - Different startup configurations
    - Hot reload in dev
    - Optimized production

92. **Load Testing Support**
    - [`@colyseus/loadtest`](package.json:47)
    - Bot simulation
    - Performance benchmarking
    - Scalability testing

### Node-RED Integration

93. **Custom Node-RED Nodes**
    - [`node-red`](modules/node-red/package.json:35) config
    - [`ship-read`](modules/node-red/package.json:37) node
    - IoT integration
    - Visual programming

94. **Rollup for Editor Components**
    - [`rollup`](modules/node-red/package.json:17) build
    - Separate editor and runtime
    - Browser-compatible editor code
    - Node-compatible runtime

95. **Node-RED Examples**
    - [`examples/`](modules/node-red/examples/) directory
    - Flow templates
    - Usage documentation
    - Quick start guide

### Configuration & Asset Management

96. **Copyfiles for Assets**
    - [`copyfiles`](package.json:70) script
    - Icon and asset copying
    - Build artifact management
    - Multi-stage builds