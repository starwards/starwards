# File Organization Specification

@category: project-structure
@stability: stable
@source: docs/PATTERNS.md

## Quick Reference

| Concept | Pattern | Purpose |
|---------|---------|---------|
| Module Structure | Feature-based | Group by domain, not type |
| Directory Naming | kebab-case | Lowercase with hyphens |
| Import Order | External → Internal → Relative | Organized by source |
| Barrel Exports | index.ts | Public API definition |
| Test Location | Separate test/ directory | Co-located with source |

---

# Project Structure
@pattern: monorepo
@manager: npm-workspaces
@root: /data/Workspace/helios/starwards

## Workspace Layout
```
starwards/
├── modules/              # Workspace packages
│   ├── core/            # Core game logic
│   ├── browser/         # Client UI
│   ├── server/          # Server implementation
│   ├── node-red/        # Node-RED integration
│   └── e2e/             # End-to-end tests
├── docs/                # Documentation
├── scripts/             # Build scripts
├── static/              # Static assets
├── models/              # 3D models
├── docker/              # Docker configs
└── package.json         # Root package
```

## Module Structure
```
modules/core/
├── src/                 # Source code
│   ├── space/          # Space domain
│   ├── ship/           # Ship domain
│   ├── logic/          # Business logic
│   ├── client/         # Client drivers
│   └── index.ts        # Barrel export
├── test/               # Test files
│   ├── ship-manager.spec.ts
│   └── space-manager.spec.ts
├── package.json        # Module package
└── tsconfig.json       # TypeScript config
```

---

# Module Organization
@pattern: feature-based
@principle: domain-driven-design

-> groups: by-feature
-> separates: by-domain
-> avoids: by-type
:: organizational-pattern

## Feature-Based Structure

### ✅ Correct - Feature-Based
```
modules/core/src/
├── ship/                   # All ship-related code
│   ├── ship-state.ts
│   ├── ship-manager.ts
│   ├── reactor.ts
│   ├── thruster.ts
│   ├── system.ts
│   └── index.ts
├── space/                  # All space-related code
│   ├── space-state.ts
│   ├── space-manager.ts
│   ├── spaceship.ts
│   ├── asteroid.ts
│   └── index.ts
└── logic/                  # Cross-cutting logic
    ├── collisions-utils.ts
    ├── space-manager.ts
    └── formulas.ts
```

### ❌ Wrong - Type-Based
```
modules/core/src/
├── states/             # Grouped by type (bad)
│   ├── ship-state.ts
│   └── space-state.ts
├── managers/           # Grouped by type (bad)
│   ├── ship-manager.ts
│   └── space-manager.ts
└── models/             # Grouped by type (bad)
    ├── reactor.ts
    └── spaceship.ts
```

## Domain Boundaries

### Core Domain
```
modules/core/src/
├── space/          # Space simulation domain
├── ship/           # Ship systems domain
├── logic/          # Business logic domain
├── client/         # Client driver domain
└── admin/          # Administration domain
```

### Browser Domain
```
modules/browser/src/
├── widgets/        # UI widgets
├── screens/        # Screen layouts
├── radar/          # Radar visualization
├── input/          # Input handling
└── panel/          # Control panels
```

### Server Domain
```
modules/server/src/
├── admin/          # Admin room
├── ship/           # Ship room
├── space/          # Space room
└── server.ts       # Express server
```

---

# Directory Structure Rules
@category: organization-guidelines

## Rule 1: Group by Feature
@principle: high-cohesion

```
✅ DO: Group related functionality together
modules/core/src/ship/
├── ship-state.ts       # State
├── ship-manager.ts     # Manager
├── reactor.ts          # System
├── thruster.ts         # System
└── index.ts            # Exports

✗ DON'T: Separate by technical type
modules/core/src/
├── states/ship-state.ts
├── managers/ship-manager.ts
└── systems/reactor.ts
```

## Rule 2: Shallow Hierarchy
@principle: easy-navigation

```
✅ DO: Keep directories shallow (2-3 levels)
modules/core/src/
├── ship/
│   └── reactor.ts
└── space/
    └── spaceship.ts

✗ DON'T: Create deep nesting
modules/core/src/
├── game/
│   └── entities/
│       └── ships/
│           └── systems/
│               └── reactor.ts
```

## Rule 3: Consistent Structure
@principle: predictability

```
✅ DO: Use consistent patterns across modules
modules/core/src/ship/
modules/core/src/space/
modules/core/src/logic/

modules/browser/src/widgets/
modules/browser/src/screens/
modules/browser/src/radar/
```

---

# Import Organization
@pattern: grouped-imports
@order: external-internal-relative

## Import Order

### 1. External Dependencies
```typescript
// Third-party libraries
import { Schema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';
import React from 'react';
```

### 2. Internal Absolute Imports
```typescript
// Workspace packages
import { SpaceState, ShipState } from '@starwards/core';
import { ShipDriver } from '@starwards/core/client';
```

### 3. Relative Imports
```typescript
// Same module
import { gameField } from '../game-field';
import { Reactor } from './reactor';
import { SystemState } from './system';
```

### 4. Type-Only Imports (Optional)
```typescript
// Type imports
import type { XY } from '../logic/xy';
import type { IterationData } from '../updateable';
```

## Complete Example
```typescript
// 1. External dependencies
import { Schema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';

// 2. Internal absolute imports
import { SpaceState, ShipState } from '@starwards/core';

// 3. Relative imports
import { gameField } from '../game-field';
import { Reactor } from './reactor';

// 4. Type-only imports
import type { XY } from '../logic/xy';

export class MyClass extends Schema {
    // ...
}
```

---

# Export Pattern
@pattern: named-exports
@aggregation: barrel-exports

## Named Exports
@preferred: true

### ✅ Use Named Exports
```typescript
// reactor.ts
export class Reactor extends SystemState {
    // ...
}

export class ReactorDesignState extends DesignState {
    // ...
}

export const DEFAULT_ENERGY = 1000;
```

### ❌ Avoid Default Exports
```typescript
// reactor.ts
export default class Reactor {
    // ...
}

// Importing becomes inconsistent
import Reactor from './reactor';      // Could be anything
import MyReactor from './reactor';    // Different name
```

## Barrel Exports
@file: index.ts
@purpose: public-api-definition

### Module-Level Barrels
```typescript
// modules/core/src/ship/index.ts
export { Reactor, ReactorDesignState } from './reactor';
export { Thruster, ThrusterDesignState } from './thruster';
export { ShipState } from './ship-state';
export { ShipManager } from './ship-manager';
export { SystemState, DesignState } from './system';
```

### Root-Level Barrel
```typescript
// modules/core/src/index.ts
export * from './space';
export * from './ship';
export * from './logic';
export * from './client';
export * from './commands';
export * from './events';
```

### Usage
```typescript
// Clean imports from barrel
import { 
    Reactor, 
    ShipState, 
    SpaceState,
    XY 
} from '@starwards/core';

// Instead of
import { Reactor } from '@starwards/core/ship/reactor';
import { ShipState } from '@starwards/core/ship/ship-state';
import { SpaceState } from '@starwards/core/space/space-state';
import { XY } from '@starwards/core/logic/xy';
```

---

# File Placement Guidelines

## Source Files
@location: src/

```
modules/core/
└── src/
    ├── space/              # Domain directory
    │   ├── space-state.ts
    │   ├── spaceship.ts
    │   └── index.ts
    └── ship/               # Domain directory
        ├── ship-state.ts
        ├── reactor.ts
        └── index.ts
```

## Test Files
@location: test/
@pattern: co-located-domain

```
modules/core/
├── src/
│   ├── ship/
│   │   └── ship-manager.ts
│   └── space/
│       └── space-manager.ts
└── test/
    ├── ship-manager.spec.ts    # Test for src/ship/ship-manager.ts
    └── space-manager.spec.ts   # Test for src/space/space-manager.ts
```

## Type Definitions
@location: custom-typings/

```
custom-typings/
├── mini-signals/
│   └── index.d.ts
└── pixi__core/
    └── index.d.ts
```

## Static Assets
@location: static/

```
static/
├── fonts/
│   ├── BebasNeue-Regular.ttf
│   └── Electrolize-Regular.ttf
├── models/
│   ├── Asteroid_01/
│   └── spaceship_nortend/
└── textures/
```

## Documentation
@location: docs/

```
docs/
├── specs/              # Specifications (this directory)
├── PATTERNS.md
├── LLM_CONTEXT.md
└── INTEGRATION.md
```

---

# Import Path Conventions

## Absolute Paths
@usage: cross-module
@prefix: @starwards/

```typescript
// From browser to core
import { SpaceState, ShipState } from '@starwards/core';
import { ShipDriver } from '@starwards/core/client';

// From server to core
import { SpaceManager } from '@starwards/core/logic';
```

## Relative Paths
@usage: same-module
@pattern: ../

```typescript
// Same level
import { Reactor } from './reactor';

// Parent directory
import { gameField } from '../game-field';

// Nested
import { SystemState } from './system';
```

## Path Aliases
@config: tsconfig.json

```json
{
    "compilerOptions": {
        "baseUrl": ".",
        "paths": {
            "@starwards/core": ["modules/core/src"],
            "@starwards/core/*": ["modules/core/src/*"]
        }
    }
}
```

---

# Module Dependencies

## Dependency Direction
```
browser → core
server → core
node-red → core

core ← (no dependencies on other modules)
```

## Allowed Dependencies

### Core Module
```typescript
// ✅ CAN import
import { Schema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';

// ❌ CANNOT import
import { Dashboard } from '@starwards/browser';  // No!
```

### Browser Module
```typescript
// ✅ CAN import
import { ShipState } from '@starwards/core';
import React from 'react';
import PixiJS from 'pixi.js';

// ❌ CANNOT import
import { ShipRoom } from '@starwards/server';  // No!
```

### Server Module
```typescript
// ✅ CAN import
import { SpaceManager } from '@starwards/core';
import { Room } from 'colyseus';

// ❌ CANNOT import
import { Dashboard } from '@starwards/browser';  // No!
```

---

# Special Directories

## /src Directory
@purpose: source-code
@structure: domain-based

```
modules/core/src/
├── space/          # Space domain
├── ship/           # Ship domain
├── logic/          # Business logic
├── client/         # Client code
├── admin/          # Admin code
└── index.ts        # Public API
```

## /test Directory
@purpose: test-files
@pattern: mirrors-src

```
modules/core/test/
├── ship-manager.spec.ts
├── space-manager.spec.ts
├── energy-manager.spec.ts
└── test-utils.ts
```

## /templates Directory
@purpose: html-templates
@location: modules/browser/templates

```
modules/browser/templates/
├── main.html
├── station.html
├── sidebar.html
└── input.html
```

## /examples Directory
@purpose: usage-examples
@location: modules/node-red/examples

```
modules/node-red/examples/
└── basic usage.json
```

---

# File Naming Patterns

## State Files
```
ship-state.ts       → class ShipState
space-state.ts      → class SpaceState
admin-state.ts      → class AdminState
```

## Manager Files
```
ship-manager.ts     → class ShipManager
space-manager.ts    → class SpaceManager
energy-manager.ts   → class EnergyManager
```

## System Files
```
reactor.ts          → class Reactor
thruster.ts         → class Thruster
radar.ts            → class Radar
```

## Utility Files
```
collision-utils.ts  → collision utilities
async-utils.ts      → async utilities
formulas.ts         → formula functions
```

## Component Files
```
lobby.tsx           → Lobby component
damage-report.tsx   → DamageReport component
save-load-game.tsx  → SaveLoadGame component
```

---

# Configuration Files

## Root Level
```
starwards/
├── package.json            # Root package
├── tsconfig.json           # Root TS config
├── .eslintrc.js           # ESLint config
├── .prettierrc.json       # Prettier config
├── playwright.config.ts   # Playwright config
└── docker-compose.yml     # Docker config
```

## Module Level
```
modules/core/
├── package.json           # Module package
├── tsconfig.json          # Build config
└── tsconfig.runtime.json  # Runtime config
```

---

# Best Practices

## DO
✓ Group files by feature/domain
✓ Keep directory structure shallow
✓ Use barrel exports for public API
✓ Follow consistent import order
✓ Use named exports
✓ Place tests in separate directory
✓ Use absolute imports for cross-module
✓ Use relative imports within module
✓ Maintain clear module boundaries

## DON'T
✗ Group files by technical type
✗ Create deep directory nesting
✗ Use default exports
✗ Mix import styles inconsistently
✗ Create circular dependencies
✗ Import from other workspace modules in core
✗ Scatter test files randomly
✗ Use deep relative paths (../../..)
✗ Export internal implementation details

---

# Creating New Modules

## Step-by-Step Guide

### 1. Create Module Directory
```bash
mkdir -p modules/my-module/src
mkdir -p modules/my-module/test
```

### 2. Create package.json
```json
{
    "name": "@starwards/my-module",
    "version": "1.0.0",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "scripts": {
        "build": "tsc",
        "test": "jest"
    },
    "dependencies": {
        "@starwards/core": "workspace:*"
    }
}
```

### 3. Create tsconfig.json
```json
{
    "extends": "../../tsconfig.json",
    "compilerOptions": {
        "outDir": "./dist",
        "rootDir": "./src"
    },
    "include": ["src/**/*"]
}
```

### 4. Create Source Structure
```
modules/my-module/src/
├── domain1/
│   ├── class1.ts
│   └── index.ts
├── domain2/
│   ├── class2.ts
│   └── index.ts
└── index.ts
```

### 5. Create Barrel Export
```typescript
// modules/my-module/src/index.ts
export * from './domain1';
export * from './domain2';
```

---

# Migration Guide

## Refactoring to Feature-Based

### Before (Type-Based)
```
src/
├── states/
│   ├── ship-state.ts
│   └── space-state.ts
├── managers/
│   ├── ship-manager.ts
│   └── space-manager.ts
└── systems/
    └── reactor.ts
```

### After (Feature-Based)
```
src/
├── ship/
│   ├── ship-state.ts
│   ├── ship-manager.ts
│   ├── reactor.ts
│   └── index.ts
└── space/
    ├── space-state.ts
    ├── space-manager.ts
    └── index.ts
```

### Update Imports
```typescript
// Before
import { ShipState } from '../states/ship-state';
import { ShipManager } from '../managers/ship-manager';

// After
import { ShipState, ShipManager } from './ship';
// Or with barrel
import { ShipState, ShipManager } from '@starwards/core/ship';
```

---

# Template: New Feature

```
modules/core/src/my-feature/
├── my-feature-state.ts     # State class
├── my-feature-manager.ts   # Manager class
├── helper.ts               # Helper utilities
└── index.ts                # Barrel export

// index.ts
export { MyFeatureState } from './my-feature-state';
export { MyFeatureManager } from './my-feature-manager';
export * from './helper';
```

---

# Related Specifications

-> see: [NAMING_CONVENTIONS_SPEC.md](NAMING_CONVENTIONS_SPEC.md)
-> see: [PATTERNS.md](../PATTERNS.md)