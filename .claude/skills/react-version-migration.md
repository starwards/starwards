# React Version Migration Expert

Expert guide for migrating Starwards between React 17, 18, and 19.

## Overview

### Version Compatibility Matrix

| Component | React 17 | React 18 | React 19 |
|-----------|----------|----------|----------|
| ReactDOM.render() | ✅ Supported | ⚠️ Deprecated | ❌ Removed |
| createRoot() | ❌ N/A | ✅ Recommended | ✅ Required |
| Old Arwes (alpha.19) | ✅ Compatible | ⚠️ Peer dep warning | ❌ Incompatible |
| @arwes/react (1.0.0-next) | ❌ Incompatible | ✅ Compatible | ❌ Incompatible |
| @arwes-amir/react | ❌ N/A | ❌ N/A | ⚠️ Incomplete |
| @xstate/react v4 | ✅ Compatible | ✅ Compatible | ❌ Unknown |
| @xstate/react v6 | ❌ Unknown | ✅ Compatible | ✅ Compatible |

### Current State

**As of this writing**: Project is on React 18.2.0 with `@arwes/react@1.0.0-next.25020502`

## Migration Guides

### React 17 → React 18

#### 1. Update Packages

**Root `package.json`:**
```json
{
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

**`modules/browser/package.json`:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

#### 2. Update Rendering API (Recommended)

**File**: `modules/browser/src/screens/index.tsx`

Before:
```typescript
import ReactDOM from 'react-dom';

const driver = new Driver(window.location).connect();
ReactDOM.render(<Lobby driver={driver} />, document.querySelector('#wrapper'));
```

After:
```typescript
import { createRoot } from 'react-dom/client';

const driver = new Driver(window.location).connect();
const root = createRoot(document.querySelector('#wrapper')!);
root.render(<Lobby driver={driver} />);
```

**Note**: ReactDOM.render() still works in React 18 (compat mode) but triggers console warning.

#### 3. Arwes Compatibility

**Option A**: Keep old Arwes (not recommended)
- Add `--legacy-peer-deps` to `npm install`
- Expect peer dependency warnings

**Option B**: Upgrade to new Arwes (recommended)
- Install `@arwes/react@1.0.0-next.25020502`
- Create arwes-compat.tsx (see "Arwes Compat Layer" section)

#### 4. Run & Verify

```bash
npm install
npm run build
npm test
# Check localhost:3000 - verify no console errors
```

---

### React 18 → React 19

#### 1. Update Packages

**Root `package.json`:**
```json
{
  "devDependencies": {
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2"
  }
}
```

**`modules/browser/package.json`:**
```json
{
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

#### 2. MUST Update Rendering API

React 19 **requires** createRoot() - ReactDOM.render() is completely removed.

**File**: `modules/browser/src/screens/index.tsx`

```typescript
import { createRoot } from 'react-dom/client';

const driver = new Driver(window.location).connect();
const root = createRoot(document.querySelector('#wrapper')!);
root.render(<Lobby driver={driver} />);
```

#### 3. Arwes Compatibility

**Known Issue**: As of Jan 2025, no fully compatible Arwes version exists for React 19.

Attempted solutions:
- `@arwes/react@1.0.0-next.*` - Requires React 18
- `@arwes-amir/react@^1.0.2` - Incomplete, many missing components

**Workaround**: Create comprehensive arwes-compat.tsx shim (see section below)

#### 4. Update XState React (Optional)

```json
{
  "@xstate/react": "^6.0.0"
}
```

Note: v6 works with React 19, v4 compatibility unknown.

#### 5. Verification

```bash
npm install
npm run build
npm test
```

**Expected**: Build succeeds, but UI may have Arwes component gaps.

---

### React 19 → React 18 (Downgrade)

#### 1. Downgrade Packages

**Root `package.json`:**
```json
{
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

**`modules/browser/package.json`:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@arwes/react": "1.0.0-next.25020502"
  }
}
```

Remove `@arwes-amir/react` if present.

#### 2. Keep createRoot() API

React 18 supports createRoot(), so no code changes needed if already using it.

**File**: `modules/browser/src/screens/index.tsx` (no change needed)

```typescript
import { createRoot } from 'react-dom/client';

const driver = new Driver(window.location).connect();
const root = createRoot(document.querySelector('#wrapper')!);
root.render(<Lobby driver={driver} />);
```

#### 3. Update arwes-compat.tsx

Ensure compatibility layer matches new Arwes API (see section below).

#### 4. Install & Verify

```bash
npm install
npm run build
npm test
```

---

### React 19/18 → React 17 (Full Revert)

#### 1. Downgrade All Packages

**Root `package.json`:**
```json
{
  "devDependencies": {
    "@types/react": "^17.0.89",
    "@types/react-dom": "^17.0.26"
  }
}
```

**`modules/browser/package.json`:**
```json
{
  "dependencies": {
    "react": "^17.0.2",
    "react-dom": "^17.0.2",
    "@arwes/animation": "1.0.0-alpha.19",
    "@arwes/core": "1.0.0-alpha.19",
    "@arwes/design": "1.0.0-alpha.19",
    "@arwes/sounds": "1.0.0-alpha.19",
    "@xstate/react": "^4.1.3"
  }
}
```

#### 2. Revert Rendering API

**File**: `modules/browser/src/screens/index.tsx`

```typescript
import ReactDOM from 'react-dom';

const driver = new Driver(window.location).connect();
ReactDOM.render(<Lobby driver={driver} />, document.querySelector('#wrapper'));
```

#### 3. Restore Old Arwes Imports

**Revert all files**:
- `modules/browser/src/components/lobby.tsx`
- `modules/browser/src/components/save-load-game.tsx`
- `modules/browser/src/widgets/monitor.tsx`
- `modules/browser/src/widgets/damage-report.tsx`

Change imports back:
```typescript
import { ArwesThemeProvider, Button, Card, Text } from '@arwes/core';
import { AnimatorGeneralProvider } from '@arwes/animation';
import { BleepsProvider } from '@arwes/sounds';
```

#### 4. Delete arwes-compat.tsx

```bash
rm modules/browser/src/components/arwes-compat.tsx
```

#### 5. Restore Type Definitions

**File**: `custom-typings/arwes__core/index.d.ts`

Restore from git or recreate type definitions for old Arwes.

#### 6. Verify

```bash
npm install
npm run build
npm test
```

---

## Arwes Compatibility Layer

### When to Use arwes-compat.tsx

Use when:
- React 18+ but old Arwes components needed
- New Arwes lacks required components
- Temporary bridge during migration

### Implementation Pattern

**File**: `modules/browser/src/components/arwes-compat.tsx`

#### Core Structure

```typescript
import React, { createContext, useContext } from 'react';
import { AnimatorGeneralProvider as NewAnimatorGeneralProvider } from '@arwes/react';
import type { AnimatorGeneralProviderSettings } from '@arwes/react';

// Re-export what works from new Arwes
export * from '@arwes/react';

// Shim what doesn't exist or has breaking changes
```

#### Theme Provider

Old Arwes had `ArwesThemeProvider`, new doesn't. Create simple wrapper:

```typescript
interface ArwesThemeProviderProps {
    children: React.ReactNode;
}

export const ArwesThemeProvider: React.FC<ArwesThemeProviderProps> = ({ children }) => {
    return (
        <div
            style={{
                fontFamily: 'Electrolize, Titillium Web, sans-serif',
                color: '#7ef8f0',
                backgroundColor: '#000',
            }}
        >
            {children}
        </div>
    );
};

export const StylesBaseline: React.FC = () => null;
```

#### Animator Provider

Old API used milliseconds, new uses seconds:

```typescript
interface AnimatorSettings {
    duration?: { enter?: number; exit?: number } | number;
}

export const AnimatorGeneralProvider: React.FC<{
    animator?: AnimatorSettings;
    children: React.ReactNode;
}> = ({ animator, children }) => {
    const settings: AnimatorGeneralProviderSettings = {};

    if (animator?.duration) {
        if (typeof animator.duration === 'number') {
            settings.duration = animator.duration / 1000; // ms to seconds
        } else {
            settings.duration = {
                enter: (animator.duration.enter || 200) / 1000,
                exit: (animator.duration.exit || 200) / 1000,
            };
        }
    }

    return <NewAnimatorGeneralProvider {...settings}>{children}</NewAnimatorGeneralProvider>;
};
```

#### Bleeps Provider (Audio Stub)

```typescript
const BleepsContext = createContext<any>(null);

export const BleepsProvider: React.FC<{
    audioSettings?: any;
    playersSettings?: any;
    bleepsSettings?: any;
    children: React.ReactNode;
}> = ({ children }) => {
    // Stub - audio not functional but prevents crashes
    const bleepsValue = {
        play: (name: string) => {},
        stop: (name: string) => {},
    };

    return <BleepsContext.Provider value={bleepsValue}>{children}</BleepsContext.Provider>;
};
```

#### Button Component

```typescript
interface ButtonProps {
    palette?: 'primary' | 'success' | 'error' | 'secondary';
    onClick?: () => void;
    children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ palette = 'primary', onClick, children }) => {
    const colors = {
        primary: '#26daaa',
        success: '#0f0',
        error: '#f00',
        secondary: '#7ef8f0',
    };

    return (
        <button
            onClick={onClick}
            style={{
                backgroundColor: 'transparent',
                border: `1px solid ${colors[palette]}`,
                color: colors[palette],
                padding: '8px 16px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '14px',
                textTransform: 'uppercase',
            }}
        >
            {children}
        </button>
    );
};
```

#### Card Component (CRITICAL)

**Common Error**: `TypeError: options?.map is not a function`

**Root Cause**: Old Arwes accepts ReactNode, not array.

**Correct Implementation**:

```typescript
interface CardProps {
    title?: string;
    image?: { src: string };
    options?: React.ReactNode; // NOT an array!
    onClick?: () => void;
    children?: React.ReactNode;
    style?: React.CSSProperties;
    hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ title, image, options, children, style }) => {
    return (
        <div
            style={{
                border: '1px solid #26daaa',
                padding: '16px',
                marginBottom: '16px',
                backgroundColor: 'rgba(38, 218, 170, 0.05)',
                ...style,
            }}
        >
            {image && <img src={image.src} alt={title} style={{ width: '100%', marginBottom: '8px' }} />}
            {title && <h3 style={{ margin: '0 0 12px 0', color: '#7ef8f0' }}>{title}</h3>}
            {children}
            {options && <div style={{ marginTop: '12px' }}>{options}</div>}
        </div>
    );
};
```

**Usage** (lobby.tsx):
```typescript
<Card
    title="Game Master"
    image={{ src: '/images/photos/nebula.jpg' }}
    options={
        <Button onClick={() => window.location.assign('gm.html')}>
            Game Master
        </Button>
    }
>
    Manage the game
</Card>
```

#### FrameCorners Component (CRITICAL)

**Common Error**: Content invisible with cyan background covering viewport.

**Root Cause**: New Arwes FrameCorners uses SVG with full-viewport background rect.

**Solution**: Simple border wrapper:

```typescript
interface FrameCornersProps {
    animator?: any;
    palette?: string;
    hover?: boolean;
    children: React.ReactNode;
}

export const FrameCorners: React.FC<FrameCornersProps> = ({ children, palette }) => {
    const color = palette === 'success' ? '#0f0' : '#26daaa';

    return (
        <div
            style={{
                border: `2px solid ${color}`,
                padding: '16px',
                position: 'relative',
                backgroundColor: 'transparent', // CRITICAL!
            }}
        >
            {children}
        </div>
    );
};
```

#### Text & Blockquote

```typescript
export const Text: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
    children,
    style,
}) => {
    return <div style={{ color: '#7ef8f0', ...style }}>{children}</div>;
};

export const Blockquote: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <blockquote
            style={{
                borderLeft: '3px solid #26daaa',
                paddingLeft: '16px',
                margin: '16px 0',
                fontStyle: 'italic',
                color: '#7ef8f0',
            }}
        >
            {children}
        </blockquote>
    );
};
```

---

## Common Issues & Fixes

### Issue 1: TypeError: options?.map is not a function

**Symptoms**: Card component crashes, React error boundary triggered

**Location**: `arwes-compat.tsx` Card component

**Cause**: Card `options` prop defined as array but receives ReactNode

**Fix**: Change interface to accept ReactNode instead of array:

```typescript
// ❌ WRONG
interface CardProps {
    options?: CardOption[];
}
// Component uses: options?.map(...)

// ✅ CORRECT
interface CardProps {
    options?: React.ReactNode;
}
// Component uses: {options && <div>{options}</div>}
```

**Files to check**:
- `modules/browser/src/components/arwes-compat.tsx`
- `modules/browser/src/components/lobby.tsx` (usage)

---

### Issue 2: Content Invisible - Cyan Background

**Symptoms**: Page loads with solid cyan background, no text visible

**Location**: Components using FrameCorners

**Cause**: New Arwes FrameCorners renders SVG with full-viewport background rect

**Visual Check**: Inspect element shows:
```html
<svg position: absolute; inset: 0; width: 100%; height: 100%>
  <rect fill="rgb(126, 248, 240)"> <!-- Covers everything! -->
```

**Fix Options**:

1. **Use arwes-compat FrameCorners** (recommended):
```typescript
import { FrameCorners } from './arwes-compat';
```

2. **Don't import from @arwes/react**:
```typescript
// ❌ WRONG
import { FrameCorners } from '@arwes/react';

// ✅ CORRECT
import { FrameCorners } from './arwes-compat';
```

**Files to check**:
- `modules/browser/src/components/save-load-game.tsx`

---

### Issue 3: ReactDOM.render() Deprecation Warning

**Symptoms**: Console warning in React 18:
```
Warning: ReactDOM.render is no longer supported in React 18.
Use createRoot instead.
```

**Cause**: Using old rendering API

**Impact**: App works but runs in React 17 compatibility mode

**Fix**: Update to createRoot()

**File**: `modules/browser/src/screens/index.tsx`

```typescript
// Before
import ReactDOM from 'react-dom';
ReactDOM.render(<Lobby driver={driver} />, wrapper);

// After
import { createRoot } from 'react-dom/client';
const root = createRoot(wrapper!);
root.render(<Lobby driver={driver} />);
```

---

### Issue 4: Duplicate Key Warnings

**Symptoms**: Console warnings:
```
Warning: Encountered two children with the same key, `input`.
Keys should be unique...
```

**Location**: Usually in lists or adjacent sibling components

**Example** (lobby.tsx):
```typescript
// ❌ WRONG
<Button key="input">Input</Button>
<Button key="input">Colyseus Monitor</Button>

// ✅ CORRECT
<Button key="input">Input</Button>
<Button key="colyseus-monitor">Colyseus Monitor</Button>
```

**How to Find**:
```bash
grep -n 'key="input"' modules/browser/src/components/lobby.tsx
```

**Fix**: Make keys unique by using descriptive identifiers.

---

### Issue 5: Arwes Peer Dependency Conflicts

**Symptoms**: npm install fails or warns about peer dependencies

**Example**:
```
npm error peer react@"17.x" from @arwes/animation@1.0.0-alpha.19
npm error peer react@"^18.2.0" from your package
```

**Cause**: Old Arwes (alpha.19) only supports React 17

**Solutions**:

1. **Use --legacy-peer-deps** (quick fix):
```bash
npm install --legacy-peer-deps
```

2. **Upgrade to new Arwes** (recommended):
```json
{
  "dependencies": {
    "@arwes/react": "1.0.0-next.25020502"
  }
}
```
Then create arwes-compat.tsx.

3. **Downgrade to React 17** (if necessary):
See "React 18 → React 17" migration guide above.

---

### Issue 6: XState React Version Mismatch

**Symptoms**: Type errors or runtime issues with `useMachine` hook

**Cause**: @xstate/react version incompatible with React version

**Solution Matrix**:

| React Version | @xstate/react Version |
|---------------|----------------------|
| 17 | ^4.1.3 |
| 18 | ^4.1.3 or ^6.0.0 |
| 19 | ^6.0.0 |

**Migration** (if needed):

```json
// React 17/18
{
  "@xstate/react": "^4.1.3"
}

// React 18/19
{
  "@xstate/react": "^6.0.0"
}
```

**Code Changes**: Usually none needed - API is stable between v4 and v6.

---

## Verification Checklist

### After Any React Migration

#### 1. Clean Install
```bash
rm -rf node_modules package-lock.json
npm install
```

#### 2. Build All Modules
```bash
npm run build
```

**Expected Output**:
```
[browser] webpack 5.x compiled with 2 warnings
[browser] npm run build:browser exited with code 0
```

**Warnings OK**:
- Source map warnings
- Deprecated package warnings (if using legacy deps)

**Errors NOT OK**:
- Module not found
- Type errors
- Build failures

#### 3. Run Tests
```bash
npm test
```

**Expected**:
```
Test Suites: 19 passed
Tests: 96 passed, 2 skipped
```

#### 4. Browser Testing

Start dev server:
```bash
# Terminal 1
cd modules/core && npm run build:watch

# Terminal 2
cd modules/browser && npm start

# Terminal 3
node -r ts-node/register/transpile-only ./modules/server/src/dev.ts
```

Visit: http://localhost:3000

**Check**:
- [ ] Page loads (no white screen)
- [ ] Content visible (text readable)
- [ ] Buttons styled (cyan borders)
- [ ] Cards render with images
- [ ] Navigation works (click buttons)
- [ ] No React errors in console
- [ ] Only acceptable warnings (see below)

**Console - Acceptable Warnings**:
```
%cDownload the React DevTools...
Failed to load resource: .../favicon.ico (404)
```

**Console - NOT Acceptable** (indicates broken migration):
```
TypeError: options?.map is not a function
Warning: ReactDOM.render is no longer supported (React 19 only)
Warning: Encountered two children with the same key
Module not found: Can't resolve '@arwes/...'
```

#### 5. E2E Tests (Optional)
```bash
npm run test:e2e
```

---

## Quick Reference

### Package Versions by React Version

#### React 17 Setup
```json
{
  "devDependencies": {
    "@types/react": "^17.0.89",
    "@types/react-dom": "^17.0.26"
  },
  "dependencies": {
    "react": "^17.0.2",
    "react-dom": "^17.0.2",
    "@arwes/animation": "1.0.0-alpha.19",
    "@arwes/core": "1.0.0-alpha.19",
    "@arwes/design": "1.0.0-alpha.19",
    "@arwes/sounds": "1.0.0-alpha.19",
    "@xstate/react": "^4.1.3"
  }
}
```

#### React 18 Setup (Current)
```json
{
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@arwes/react": "1.0.0-next.25020502",
    "@xstate/react": "^6.0.0"
  }
}
```

#### React 19 Setup (Not Fully Supported)
```json
{
  "devDependencies": {
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@xstate/react": "^6.0.0"
    // Arwes: Use comprehensive arwes-compat.tsx
  }
}
```

### Critical Files for Migrations

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `package.json` (root) | Type definitions | React type versions |
| `modules/browser/package.json` | Runtime deps | React, Arwes versions |
| `modules/browser/src/screens/index.tsx` | Rendering API | ReactDOM.render vs createRoot |
| `modules/browser/src/components/arwes-compat.tsx` | Arwes shim | Create/update as needed |
| `modules/browser/src/components/lobby.tsx` | Arwes imports | Import source changes |
| `modules/browser/src/components/save-load-game.tsx` | FrameCorners | Import source changes |
| `modules/browser/src/widgets/monitor.tsx` | Arwes imports | Import source changes |
| `modules/browser/src/widgets/damage-report.tsx` | Arwes imports | Import source changes |
| `custom-typings/arwes__core/index.d.ts` | Type definitions | Create/delete as needed |

---

## Troubleshooting

### Build Fails with Module Not Found

**Check**:
1. Did you run `npm install`?
2. Are all Arwes packages installed?
3. Check import paths in error message
4. Verify arwes-compat.tsx exists if needed

**Fix**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Browser Shows Blank Page

**Check**:
1. Browser console for errors
2. Network tab for failed requests
3. Inspect element - is DOM rendering?

**Common Causes**:
- React rendering error → Check console
- FrameCorners overlay → See Issue 2 above
- Build didn't complete → Re-run build

### Tests Fail After Migration

**Common Causes**:
1. Import errors (wrong Arwes package)
2. Type mismatches (wrong @types/react)
3. API changes not updated

**Debug**:
```bash
npm test -- --verbose
```

Look for first failure, fix imports/types there first.

---

## Best Practices

### When Upgrading React

1. **Update types first** - Install new @types/react before code changes
2. **Build incrementally** - Update one module at a time
3. **Test between changes** - Verify build after each step
4. **Check Arwes compatibility** - Research before choosing version
5. **Use createRoot early** - Avoid ReactDOM.render() in React 18+

### When Downgrading React

1. **Commit current state** - Easy rollback if issues
2. **Read old code** - Use git to see previous working state
3. **Restore old imports** - Don't mix old/new Arwes imports
4. **Delete compat layer** - If reverting to old Arwes completely
5. **Clean install** - Delete node_modules, fresh install

### Arwes-Compat Maintenance

1. **Only shim what's needed** - Don't reimplement everything
2. **Match old API exactly** - Preserve prop names/types
3. **Use simple implementations** - Basic CSS > complex SVG
4. **Document breaking changes** - Comment why shims exist
5. **Test all components** - Verify in browser, not just build

---

## Related Documentation

- [React 18 Upgrade Guide](https://react.dev/blog/2022/03/08/react-18-upgrade-guide)
- [React 19 Blog](https://react.dev/blog/2024/12/05/react-19)
- [Arwes GitHub](https://github.com/arwes/arwes)
- [XState React Migration](https://stately.ai/docs/migration)
- [Project DEPENDENCIES.md](../../docs/DEPENDENCIES.md)

---

## Change Log

- **2025-01-22**: Initial creation documenting React 17/18/19 migrations
- Captured React 19 → 18 downgrade process
- Documented all arwes-compat.tsx patterns
- Added comprehensive troubleshooting guide
