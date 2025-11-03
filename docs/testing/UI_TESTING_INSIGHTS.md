# UI Testing Insights - Starwards

**Key lessons from refactoring E2E tests for Tweakpane panels**

## Problem Statement

E2E tests using `page.getByText()` to select Tweakpane UI elements hit **Playwright strict mode violations** because Tweakpane creates multiple DOM elements with the same text (folder buttons + internal labels).

## Solution Architecture

### 1. Semantic Selector Pattern

**Implementation**: Helper function that wraps Tweakpane creation
```typescript
// modules/browser/src/panel/blades.ts
export function createPane(params: { title?: string; container: HTMLElement }): Pane {
    const pane = new Pane(params);
    if (params.title) {
        pane.element.dataset.id = params.title;
    }
    return pane;
}
```

**Usage**:
```typescript
// ✅ Automatically adds data-id="Targeting"
const pane = createPane({ title: 'Targeting', container: container.getElement().get(0) });

// ❌ Old pattern - no data-id
const pane = new Pane({ title: 'Targeting', container: container.getElement().get(0) });
```

**Testing**:
```typescript
// ✅ Semantic, stable selector
const panel = page.locator('[data-id="Targeting"]');

// ❌ Implementation detail, brittle
const panel = page.getByRole('button', { name: /Targeting/ });
```

### 2. Scoped Property Search

**Problem**: `getPropertyValue(page, 'power')` fails when "power" appears in multiple panels

**Solution**: Scope search to panel via `data-id`
```typescript
// modules/e2e/test/driver.ts
export async function getPropertyValue(
    page: Page,
    labelText: string,
    panelTitle?: string
): Promise<string> {
    if (panelTitle) {
        // Use data-id for exact panel match
        const panel = page.locator(`[data-id="${panelTitle}"]`);
        const label = panel.getByText(labelText, { exact: true });
        const input = label.locator('..').locator('input');
        // Skip visibility check - Tweakpane checkboxes are CSS-hidden
        return await input.inputValue();
    }
    // ...global search fallback
}
```

**Usage**:
```typescript
// ✅ Scoped to specific panel
const power = await getPropertyValue(page, 'power', 'Reactor');

// ❌ Strict mode violation if "power" appears in multiple panels
const power = await getPropertyValue(page, 'power');
```

## Key Insights

### From User Feedback

1. **Semantic correctness > quick fixes**
   - "choosing the first is arbitrary" → Understand *why* we select, not just *how*
   - Use `getByRole()` or `data-id`, not `.first()`

2. **Systematic refactoring**
   - "look at all places with `new Pane(`" → Find ALL instances, apply comprehensive solution
   - Don't fix one test; fix the pattern

3. **Minimal code changes = architectural constraint**
   - Helper function wrapping existing behavior beats manual repetition
   - Constraint guides toward elegant solution

### From Code Architecture

1. **Tweakpane DOM structure**
   ```
   Pane (with title)
   ├── Root element (gets data-id)
   └── Folder
       ├── Button (for collapse/expand) - contains folder title
       └── Contents
           └── Labels + inputs (contain folder title in path)
   ```
   → Multiple elements match `getByText('Folder Name')` → strict mode violation

2. **CSS vs DOM visibility**
   - Tweakpane checkboxes: `visibility: hidden` (CSS) but interactive (DOM)
   - `.toBeVisible()` fails, `.inputValue()` works
   - Solution: Remove visibility assertions for inputs

3. **Test helper patterns**
   - `getPropertyValue(page, label, panelTitle?)` does intelligent scoping
   - Without `panelTitle`: global search
   - With `panelTitle`: scoped via `data-id` → prevents strict mode violations

### Testing Philosophy

**Selector evolution**:
```typescript
// ❌ Ambiguous
page.getByText('Tube 0')

// ❌ Arbitrary choice
page.getByText('Tube 0').first()

// ✅ Better, but couples to Tweakpane internals
page.getByRole('button', { name: /Tube 0/ })

// ✅✅ Best - semantic & stable
page.locator('[data-id="Tubes Status"]')
```

**Fix infrastructure, not symptoms**:
- Root cause: Missing `data-id` on panels
- Improved helper: Changed `[data-id*="..."]` (contains) → `[data-id="..."]` (exact)
- Result: All future tests benefit

## Implementation Checklist

When creating Tweakpane panels:
- ✅ Use `createPane({ title: 'Panel Name', container })`
- ❌ Don't use `new Pane({ container })`

When testing Tweakpane panels:
- ✅ Use `page.locator('[data-id="Panel Name"]')` for panel selection
- ✅ Use `getPropertyValue(page, 'label', 'PanelName')` for scoped property access
- ❌ Don't traverse Tweakpane DOM structure directly
- ❌ Don't use `.toBeVisible()` on checkboxes

When refactoring tests:
1. Deep investigation first (understand root cause)
2. Find all instances of pattern (systematic approach)
3. Create helper/wrapper (infrastructure improvement)
4. Update all call sites (comprehensive fix)
5. Validate incrementally (catch issues early)

## Lessons for Future Tasks

1. **Deep investigation before action**: Reading code, existing patterns, test helpers → better solution
2. **User constraints reveal architecture**: "Minimal changes" already identified ideal solution
3. **Incremental validation**: Helper → file → all files → tests → catch issues early
4. **Fix infrastructure**: Improve testing patterns, not just make tests pass
5. **Learn patterns**: Extract general principles from specific fixes

## References

- **Implementation**: [`modules/browser/src/panel/blades.ts`](../../modules/browser/src/panel/blades.ts#L40-L46)
- **Test Helpers**: [`modules/e2e/test/driver.ts`](../../modules/e2e/test/driver.ts#L126-L147)
- **Example Test**: [`modules/e2e/test/weapons-screen.spec.ts`](../../modules/e2e/test/weapons-screen.spec.ts#L32-L35)
- **Patterns**: [`docs/PATTERNS.md`](../PATTERNS.md)
- **Testing Guide**: [`docs/testing/README.md`](README.md#ui-testing-best-practices)
