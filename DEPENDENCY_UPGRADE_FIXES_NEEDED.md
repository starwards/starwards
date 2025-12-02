# Dependency Upgrade - Remaining Type & Lint Errors

**Branch**: `claude/upgrade-major-dependencies-011CUqMpCbn3HZVAwV9ERCzu`
**PR**: https://github.com/starwards/starwards/pull/1828
**Status**: Core ✅ | Tweakpane v4 ✅ | PixiJS v8 ✅ | React 19 ✅ | ~57 errors remaining (golden-layout + misc types)

## Executive Summary

The dependency upgrade PR successfully upgraded major dependencies but left incomplete API migrations in the `modules/browser` directory. The core module (`modules/core`) has been fully fixed and all tests pass. The browser module requires systematic migration to new library APIs.

---

## Already Fixed ✅

### Browser Module Migrations (Latest)

**8. Tweakpane v4 Migration** ✅ COMPLETE
- Fixed `ListBladeApi` return type issue
- Migrated tweakpane-table v0.4.1: replaced `.getPane()` with `.addCell()`
- Created `addTextCellToRow()` and `addSliderCellToRow()` helpers
- Updated 3 files: system-status.ts, full-system-status.ts, enginering-status.ts

**9. PixiJS v8 Migration** ✅ COMPLETE
- Migrated Graphics API from "configure → draw → finish" to "draw → style" pattern
- Updated 9 files with ~40 deprecated API calls
- Pattern: `lineStyle()` + `drawCircle()` → `.circle().stroke({})`
- Pattern: `beginFill()` + `endFill()` → `.fill({})`
- Files: grid-layer, range-indicators, interactive-layer, blips/blip-renderer, tactical/target/pilot radars, gm, armor

**10. React 19 Migration** ✅ ALREADY COMPLETE
- `ReactDOM.render()` already migrated to `createRoot().render()` in index.tsx
- All TypeScript types updated to React 19.2.2
- No deprecated APIs found
- Note: `window.ReactDOM` in dashboard.ts is intentional for golden-layout v1 compatibility

---

### Core Module Fixes (Earlier)

### 1. game-field.ts Descriptor Issue
**File**: `modules/core/src/game-field.ts`  
**Problem**: Colyseus Schema v3 changed how descriptors work, causing silent failure of float32 rounding  
**Solution**: Wrap Colyseus setter directly instead of modifying internal `_definition`  
```typescript
// Now wraps the Colyseus-created descriptor's setter
const colyseusDescriptor = Object.getOwnPropertyDescriptor(target, field);
Object.defineProperty(target, field, {
    get: colyseusDescriptor.get,
    set(value) {
        const rounded = Math.round(value * 1e2) / 1e2;
        colyseusSetter.call(this, rounded);
    }
});
```

### 2. Async Driver Pattern
**Files**: `modules/core/src/client/{admin,ship,space}.ts`  
**Problem**: colyseus-events v4 API changed to require passing `room` instead of `room.state`  
**Solution**: Added async/await pattern with `onStateChange.once()` to wait for initial state sync  
**Rationale**: RefIds must be initialized before wireEvents() is called  
**Documentation**: Added comprehensive comments explaining why this is necessary

### 3. JSON Pointer Workarounds
**Files**: `modules/core/src/commands.ts`, `modules/core/src/range.ts`  
**Problem**: Colyseus Schema v3 MapSchema requires `.get()` method; json-ptr library uses direct property access  
**Solution**: Custom traversal functions `setByPointer()` and `getParent()` that handle both MapSchema and regular objects  
**Documentation**: Added detailed comments explaining the workaround

### 4. Type Exports for Async Functions
**Files**: `modules/core/src/client/admin.ts`, `modules/core/src/client/space.ts`  
**Problem**: When drivers became async, type exports weren't updated, causing double-wrapped Promises  
**Solution**: Added `Awaited<>` utility type to unwrap the Promise  
```typescript
// Before: Promise<Promise<AdminDriver>>
export type AdminDriver = ReturnType<ReturnType<typeof AdminDriver>>;

// After: Promise<AdminDriver> ✅  
export type AdminDriver = Awaited<ReturnType<ReturnType<typeof AdminDriver>>>;
```

### 5. $changes Symbol Access
**File**: `modules/core/src/ship/system.ts`  
**Problem**: Colyseus Schema v3 changed `$changes` from property to symbol  
**Solution**: Import symbol and use bracket notation  
```typescript
import { Schema, $changes } from '@colyseus/schema';

keys() {
    return Object.keys((this as any)[$changes].indexes);
}
```

### 6. Jest Configuration
**File**: `jest.config.js`  
**Problem**: ts-jest deprecation warning about `isolatedModules`  
**Solution**: Removed from jest.config.js (already in tsconfig.json:21)

### 7. Promise Chain Simplification
**File**: `modules/core/src/client/driver.ts`  
**Problem**: Redundant async/await wrappers in promise chains  
**Solution**: Simplified `.then(async (x) => await Fn(x))` → `.then(Fn)`

---

## Core Module Status: ✅ ALL TESTS PASSING

```bash
Test Suites: 19 passed, 19 total
Tests:       2 skipped, 96 passed, 98 total
```

No TypeScript errors in core module.

---

## Browser Module Status: ❌ 142 TypeScript Errors

### Error Breakdown by Library

#### 1. PixiJS v7 → v8 Migration (~40 errors)

**Changed Exports:**
- ❌ `DisplayObject` no longer exported from `'pixi.js'`
- ❌ `IApplicationOptions` renamed to `ApplicationOptions`
- ❌ `@pixi/assets` module import path changed

**API Changes:**
- Graphics stroke/fill API changed from individual parameters to config objects
- Container/Renderer type signatures changed
- Application constructor signature changed

**Affected Files:**
- `modules/browser/src/radar/camera-view.ts` (10 errors)
- `modules/browser/src/radar/grid-layer.ts`
- `modules/browser/src/radar/interactive-layer.ts`
- `modules/browser/src/radar/line-layer.ts`
- `modules/browser/src/radar/movement-anchor-layer.ts` (already partially fixed)
- `modules/browser/src/radar/range-indicators.ts`
- `modules/browser/src/radar/sprite-layer.ts`
- `modules/browser/src/radar/blips/blip-renderer.ts` (5 errors)
- `modules/browser/src/radar/tactical-radar-layers.ts`

**Known Fix Pattern:**
The file `modules/browser/src/radar/movement-anchor-layer.ts` was already updated in commit `605bc68` with the new PixiJS v8 API:

```typescript
// OLD (v7):
this.anchors.lineStyle(width, color, alpha);
this.anchors.drawStar!(x, y, 3, 1, 0);

// NEW (v8):
this.anchors
    .star(x, y, 3, 1, 0)
    .stroke({ width, color, alpha });
```

This pattern should be applied to other graphics code.

**Research Needed:**
- How to import `DisplayObject` in v8 (likely from a sub-package)
- Correct import path for assets
- Full Application API changes

---

#### 2. Tweakpane v3 → v4 Migration (~35 errors)

**Removed Exports:**
- ❌ `InputParams`
- ❌ `ListApi`  
- ❌ `SliderApi`
- ❌ `TextApi`

**API Changes:**
- ❌ `folder.addInput()` → `folder.addBinding()`
- ❌ `folder.addMonitor()` → `folder.addBinding()` with readonly option
- ❌ `pane.exportPreset()` / `pane.importPreset()` API changed
- ❌ Internal type import paths changed (e.g., `tweakpane/dist/types/blade/root/api/preset`)

**Affected Files:**
- `modules/browser/src/panel/blades.ts` (11 errors)
- `modules/browser/src/panel/property-panel.ts` (6 errors)
- `modules/browser/src/widgets/create.ts` (5 errors)
- `modules/browser/src/widgets/dashboard.ts` (errors)
- `modules/browser/src/widgets/armor.ts` (11 errors)
- `modules/browser/src/widgets/full-system-status.ts` (10 errors)
- `modules/browser/src/widgets/monitor.tsx` (6 errors)
- `modules/browser/src/widgets/gm.ts` (6 errors)

**Migration Guide Needed:**
Tweakpane v4 made significant breaking changes to its API. Need to:
1. Replace `addInput()` calls with `addBinding()`
2. Replace `addMonitor()` calls with `addBinding()` + readonly
3. Update preset import/export code
4. Remove imports of removed types
5. Update import paths for internal types

---

#### 3. React 18 → 19 Migration ✅ COMPLETE

**Status**: Migration complete. All files already using React 19 API.

**Completed Changes:**
- ✅ `ReactDOM.render()` → `createRoot().render()` in `index.tsx`
- ✅ All TypeScript types updated to React 19.2.2
- ✅ No deprecated APIs in use
- ✅ All tests passing

**Files Checked:**
- `modules/browser/src/screens/index.tsx` - Already using `createRoot()`
- `modules/browser/src/components/lobby.tsx` - Pure component, no migration needed
- `modules/browser/src/widgets/dashboard.ts` - Note: `window.ReactDOM` exposure is intentional for golden-layout v1 compatibility

**Migration Pattern Used:**
```typescript
// ✅ Already implemented in index.tsx:
import { createRoot } from 'react-dom/client';
const root = createRoot(document.querySelector('#wrapper')!);
root.render(<Lobby driver={driver} />);
```

---

#### 4. golden-layout v1 → v2 Migration (~10 errors)

**Removed/Changed Exports:**
- ❌ `Container` export changed
- ❌ `Dashboard.on()` method changed
- ❌ `Dashboard.isInitialised` property changed
- ❌ `Dashboard.toConfig()` method changed

**Affected Files:**
- `modules/browser/src/radar/camera.ts`
- `modules/browser/src/screens/ship.ts` (3 errors)
- `modules/browser/src/widgets/dashboard.ts` (errors)

**Research Needed:**
golden-layout v2 is a complete rewrite. Need to:
1. Find correct import for Container (or equivalent)
2. Understand new event API (replacing `.on()`)
3. Find replacement for `.isInitialised`
4. Find replacement for `.toConfig()`

---

#### 5. Other Type Mismatches (~47 errors)

Various type mismatches from dependency updates that need individual attention:
- Parameter type changes
- Return type changes
- Generic type constraints
- Method signature changes

---

## Insights & Research Done

### Colyseus Schema v3 Changes

1. **MapSchema API Change**: Requires explicit `.get(key)` instead of direct property access `[key]`
   - Affected json-ptr library compatibility
   - Required custom traversal functions

2. **Symbols Instead of Properties**: Internal fields like `$changes` moved to symbols
   - Must import symbols from package
   - Use bracket notation for access

3. **Metadata API**: Field metadata moved from `_definition` to `Symbol.metadata`
   - See `modules/core/src/traverse.ts` for backward-compatible approach

4. **Descriptor Initialization**: Descriptors may not be ready when decorators run
   - Must wrap property descriptors after Colyseus creates them
   - See `modules/core/src/game-field.ts` for solution

### colyseus-events v4 Changes

**Breaking Change**: `wireEvents()` signature changed from:
```typescript
// v3:
wireEvents(state: Schema, events: EventEmitter)

// v4:  
wireEvents(room: Room, events: EventEmitter)
```

**Why the async pattern is needed:**
1. Room state may not be initialized immediately after connection
2. RefIds need to be set up for proper object tracking  
3. wireEvents needs access to full state tree

**Implementation**: Wait for `onStateChange.once()` before calling `wireEvents()`

### PixiJS v8 Changes (Partial)

1. **Graphics API**: Method chaining with config objects instead of individual parameters
   ```typescript
   // v7:
   graphics.lineStyle(width, color, alpha);
   graphics.drawStar!(x, y, points, radius, innerRadius);
   
   // v8:
   graphics
       .star(x, y, points, radius, innerRadius)
       .stroke({ width, color, alpha });
   ```

2. **@pixi/graphics-extras**: Integrated into main package (no longer separate)

### Test Infrastructure

- Jest upgraded from v29 → v30
- Switched from `@jgoz/jest-esbuild` to `ts-jest`
- All tests pass in core module after fixes

---

## Requirements for Completion

### High Priority

1. **PixiJS v8 Migration** (Browser Module)
   - [ ] Research correct imports for `DisplayObject`, `Container`, etc.
   - [ ] Research `ApplicationOptions` (renamed from `IApplicationOptions`)
   - [ ] Research correct `@pixi/assets` import path
   - [ ] Update all graphics rendering code to new API
   - [ ] Fix Application constructor calls
   - [ ] Test radar rendering works

2. **Tweakpane v4 Migration** (Browser Module)
   - [ ] Replace all `addInput()` with `addBinding()`
   - [ ] Replace all `addMonitor()` with `addBinding()` + readonly
   - [ ] Update preset export/import code
   - [ ] Remove imports of removed types
   - [ ] Update internal type import paths
   - [ ] Test all UI panels work

3. **React 19 Migration** ✅ COMPLETE
   - [x] Replace `ReactDOM.render()` with `createRoot().render()`
   - [x] Review and fix `lobby.tsx` (no errors found)
   - [x] Test rendering works

4. **golden-layout v2 Migration** (Browser Module)
   - [ ] Research new API for Container
   - [ ] Research new event system (replacing `.on()`)
   - [ ] Research replacement for `.isInitialised`
   - [ ] Research replacement for `.toConfig()`
   - [ ] Update all affected code
   - [ ] Test layout system works

### Medium Priority

5. **Run Full Type Check**
   - [ ] Fix remaining type mismatches
   - [ ] Ensure zero TypeScript errors

6. **Run Lint Check**
   - [ ] Fix any linting errors
   - [ ] Ensure code follows project standards

7. **Run Full Test Suite**
   - [ ] Ensure all unit tests pass
   - [ ] Ensure all E2E tests pass
   - [ ] Test browser functionality manually

### Low Priority (If Time Permits)

8. **Documentation**
   - [ ] Update DEPENDENCIES.md with new versions and migration notes
   - [ ] Document breaking changes for team
   - [ ] Update development docs if needed

---

## Files Requiring Changes

### Core Module (DONE ✅)
- ✅ `modules/core/src/game-field.ts`
- ✅ `modules/core/src/client/admin.ts`
- ✅ `modules/core/src/client/ship.ts`
- ✅ `modules/core/src/client/space.ts`
- ✅ `modules/core/src/client/driver.ts`
- ✅ `modules/core/src/commands.ts`
- ✅ `modules/core/src/range.ts`
- ✅ `modules/core/src/ship/system.ts`
- ✅ `jest.config.js`

### Browser Module (TODO)

**PixiJS Files:**
- `modules/browser/src/radar/camera-view.ts`
- `modules/browser/src/radar/grid-layer.ts`
- `modules/browser/src/radar/interactive-layer.ts`
- `modules/browser/src/radar/line-layer.ts`
- `modules/browser/src/radar/range-indicators.ts`
- `modules/browser/src/radar/sprite-layer.ts`
- `modules/browser/src/radar/blips/blip-renderer.ts`
- `modules/browser/src/radar/tactical-radar-layers.ts`

**Tweakpane Files:**
- `modules/browser/src/panel/blades.ts`
- `modules/browser/src/panel/property-panel.ts`
- `modules/browser/src/widgets/create.ts`
- `modules/browser/src/widgets/dashboard.ts`
- `modules/browser/src/widgets/armor.ts`
- `modules/browser/src/widgets/full-system-status.ts`
- `modules/browser/src/widgets/monitor.tsx`
- `modules/browser/src/widgets/gm.ts`

**React Files:**
- `modules/browser/src/screens/index.tsx`
- `modules/browser/src/components/lobby.tsx`

**golden-layout Files:**
- `modules/browser/src/radar/camera.ts`
- `modules/browser/src/screens/ship.ts`

---

## Testing Strategy

1. **After Each Library Migration:**
   - Run `npx tsc --noEmit` to check TypeScript errors reduced
   - Test affected UI functionality manually

2. **After All Fixes:**
   - Run full test suite: `npm test`
   - Run E2E tests: `npm run test:e2e`
   - Manual browser testing of:
     - Radar display
     - Tweakpane panels
     - Ship controls
     - Layout management

3. **Before PR Merge:**
   - Zero TypeScript errors
   - Zero lint errors
   - All tests passing
   - Manual verification of all UI features

---

## Recommended Approach

### Phase 1: Research (1-2 hours)
1. Check PixiJS v8 migration guide
2. Check Tweakpane v4 changelog/migration guide
3. Check React 19 migration guide
4. Check golden-layout v2 documentation

### Phase 2: Fix by Library (4-6 hours)
1. PixiJS migration (most errors)
2. Tweakpane migration (second most)
3. React migration (straightforward)
4. golden-layout migration (may be complex)

### Phase 3: Clean Up (1-2 hours)
1. Fix remaining type errors
2. Run linter
3. Run tests
4. Manual verification

### Phase 4: Documentation (30 min)
1. Update DEPENDENCIES.md
2. Add any necessary comments

---

## Error Log Location

Full TypeScript error output saved to: `/tmp/tsc-errors.txt`

To view:
```bash
cat /tmp/tsc-errors.txt
```

To count errors by file:
```bash
cat /tmp/tsc-errors.txt | grep "error TS" | cut -d'(' -f1 | sort | uniq -c | sort -rn
```

---

## Next Session TODO

1. **START HERE**: Research migration guides for each library
2. Create sub-tasks for each library migration
3. Begin systematic fixes
4. Test incrementally
5. Verify completion

---

## Notes

- Core module is production-ready ✅
- Browser module is NOT production-ready (142 errors) ❌
- All errors are in `modules/browser`, which is client-side only
- Server functionality (core + server modules) should work fine
- This is a good checkpoint to test headless/backend features

---

**Last Updated**: 2025-11-15  
**Branch**: claude/upgrade-major-dependencies-011CUqMpCbn3HZVAwV9ERCzu  
**Context for**: New AI session to complete browser module migration
