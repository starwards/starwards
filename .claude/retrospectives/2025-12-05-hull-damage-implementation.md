# Retrospective: Hull Damage Implementation (#1187)

**Date:** 2025-12-05
**Issue:** #1187 - Hull damage mechanic
**Branch:** `claude/implement-hull-damage-01TSkdCNqt38V6Y5KPydeG31`

---

## Summary

Implemented a simple 2-state boolean flag (`hullDamaged`) on `ShipState` for IoT alerts/lights control. This was a low-complexity task that followed existing patterns in the codebase.

---

## Key Learnings

### 1. Adding Simple State Properties to Ships

For boolean flags that need to:
- Sync to all clients (Colyseus)
- Be controllable via GM tweak panel
- Be accessible to external systems (IoT/Node-RED)

**Pattern:**
```typescript
@gameField('boolean')
@tweakable('boolean')
propertyName = false;
```

**Location:** `modules/core/src/ship/ship-state.ts`

**Example reference:** `ecrControl` property (lines 140-142)

### 2. Decorator Behaviors

| Decorator | Purpose | Effect |
|-----------|---------|--------|
| `@gameField('boolean')` | Colyseus state sync | Auto-syncs to all connected clients |
| `@tweakable('boolean')` | GM panel exposure | Auto-creates checkbox in tweak panel |
| `@range([min, max])` | Value constraints | Limits numeric values |

**No additional UI code needed** - the tweak panel automatically discovers and renders `@tweakable` properties via reflection (`getTweakables()` in `modules/browser/src/widgets/tweak.ts`).

### 3. External API Access

Properties decorated with `@gameField` are automatically accessible via **JSON Pointer** paths:
- Pattern: `/Spaceship/${shipId}/${propertyName}`
- Example: `/Spaceship/ship-1/hullDamaged`

This works out-of-the-box for Node-RED and other external integrations.

### 4. Issue Tracking Structure

Issues are tracked in `.issues/` directory:
- `.issues/open/` - Open issues as markdown files
- `.issues/milestones/` - Milestone planning documents
- Format: `{issue-number}-{slug}.md`

Example: `.issues/open/1187-hull-damage.md`

### 5. Design Documentation Location

- **MS3 designs:** `docs/MS3/`
- Key files:
  - `PLAN.md` - Implementation plan with phases and priorities
  - `PREENGINEERING.md` - Pre-engineering analysis
  - `DESIGN_ANSWERS.md` - Stakeholder decisions
  - Feature-specific designs (e.g., `SCAN_LEVELS_DESIGN.md`)

### 6. Build & Test Workflow

```bash
npm ci                  # Install dependencies (required first)
npm run build           # Build all modules (core first, then parallel)
npm test                # Run all unit tests (Jest)
npm run test:e2e        # Run E2E tests (Playwright)
```

**Build order matters:** Core must build before other modules (handled automatically by `npm run build`).

### 7. Monorepo Module Structure

```
modules/
├── core/       # Shared game logic, state definitions, decorators
├── browser/    # Frontend widgets, screens, UI components
├── server/     # Colyseus server, game managers
├── node-red/   # IoT integration nodes
└── e2e/        # Playwright E2E tests
```

### 8. Similar Low-Complexity Properties

Other boolean flags following the same pattern:
- `ecrControl` - Engineering control room flag
- `freeze` (SpaceObjectBase) - Freeze object in space
- `expendable` (SpaceObjectBase) - Can be destroyed

---

## What Went Well

1. **Clear existing patterns** - The `ecrControl` property provided an exact template to follow
2. **Automatic UI integration** - No widget code needed thanks to `@tweakable` reflection
3. **Fast verification** - Build and all 96 tests passed without issues
4. **Good documentation** - Issue files and MS3 docs clearly described requirements

---

## Recommendations for Future Sessions

### For Simple State Flags
1. Search for similar properties first (e.g., `ecrControl` for booleans)
2. Add to `ShipState` with both `@gameField` and `@tweakable` decorators
3. Build and test - no additional code usually needed

### For More Complex Features
1. Check `docs/MS3/PLAN.md` for phase/priority information
2. Look for feature-specific design docs in `docs/MS3/`
3. Review `.issues/open/{issue-number}-*.md` for requirements

### Code Exploration
- Use `Grep` for decorator patterns: `@gameField|@tweakable`
- Check `modules/core/src/ship/` for ship-related state
- E2E tests in `modules/e2e/test/` show usage patterns

---

## Files Modified

- `modules/core/src/ship/ship-state.ts` - Added `hullDamaged` property (8 lines)

---

## Related Issues

- **#1233** - Add broken status to damage report widget (similar simple UI enhancement)
- **#1238** - Ship room lifecycle (simple state management)

These follow similar low-complexity patterns and can use this implementation as reference.
