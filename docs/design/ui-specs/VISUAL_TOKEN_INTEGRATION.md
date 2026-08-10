# Visual Token Integration Architecture

Integration architecture for sharing visual tokens (colors, borders, glows) across Arwes, PixiJS, and Tweakpane frameworks in Starwards.

---

## Table of Contents

1. [CSS Variable Structure](#css-variable-structure)
2. [Tweakpane Theme Override Method](#tweakpane-theme-override-method)
3. [PixiJS Styling Hooks/Constants](#pixijs-styling-hooksconstants)
4. [Shared Token Import Pattern](#shared-token-import-pattern)
5. [Cross-Framework Color Mapping](#cross-framework-color-mapping)
6. [Glow/Border Effects](#glowborder-effects)
7. [Font Hierarchy](#font-hierarchy)
8. [Opacity/Alpha Conventions](#opacityalpha-conventions)
9. [Architecture Diagram](#architecture-diagram)
10. [Gaps and Recommendations](#gaps-and-recommendations)

---

## CSS Variable Structure

### Tweakpane Theme Variables

**File:** `/static/styles/tweakpane.css`

```css
:root {
    /* Official Tweakpane theme variables */
    --tp-base-background-color: hsla(180, 10%, 8%, 1);
    --tp-base-shadow-color: hsla(0, 0%, 0%, 0.3);

    --tp-button-background-color: hsla(180, 50%, 70%, 1);
    --tp-button-background-color-active: hsla(180, 60%, 85%, 1);
    --tp-button-background-color-focus: hsla(180, 55%, 80%, 1);
    --tp-button-background-color-hover: hsla(180, 55%, 75%, 1);
    --tp-button-foreground-color: hsla(180, 10%, 8%, 1);

    --tp-container-background-color: hsla(180, 100%, 50%, 0.08);
    --tp-container-background-color-active: hsla(180, 100%, 50%, 0.2);
    --tp-container-background-color-focus: hsla(180, 100%, 50%, 0.15);
    --tp-container-background-color-hover: hsla(180, 100%, 50%, 0.12);
    --tp-container-foreground-color: hsla(180, 50%, 70%, 1);

    --tp-groove-foreground-color: hsla(180, 100%, 50%, 0.15);

    --tp-input-background-color: hsla(180, 100%, 50%, 0.08);
    --tp-input-background-color-active: hsla(180, 100%, 50%, 0.2);
    --tp-input-background-color-focus: hsla(180, 100%, 50%, 0.15);
    --tp-input-background-color-hover: hsla(180, 100%, 50%, 0.12);
    --tp-input-foreground-color: hsla(180, 70%, 70%, 1);

    --tp-label-foreground-color: hsla(180, 40%, 50%, 1);

    --tp-monitor-background-color: hsla(180, 20%, 5%, 1);
    --tp-monitor-foreground-color: hsla(180, 40%, 50%, 1);

    /* Custom Starwards variables (unofficial) */
    --tp-font-family: Roboto Mono, Source Code Pro, Menlo, Courier, monospace;
    --tp-base-border-radius: 6px;
    --tp-container-horizontal-padding: 4px;
    --tp-element-border-radius: 2px;
    --tp-blade-spacing: 4px;
    --tp-blade-unit-size: 20px;
}
```

**Note:** Variables prefixed with `--tp-` are officially supported by Tweakpane theming. Custom Starwards variables are unofficial extensions.

### Base Application Variables

**File:** `/static/styles/index.css`

```css
/* Font loading */
@font-face {
    font-family: 'Bebas';
    src: url(../fonts/BebasNeue-Regular.ttf);
}
@font-face {
    font-family: 'Electrolize';
    src: url(../fonts/Electrolize-Regular.ttf);
}
@font-face {
    font-family: 'Titillium Web';
    src: url(../fonts/TitilliumWeb-Regular.ttf);
}

/* Layout containers */
#menuContainer {
    background: #222;
}
#menuContainer li {
    background: #1a1a1a;
    color: #bbb;
    border-bottom: 1px solid #000;
    border-top: 1px solid #333;
}
#menuContainer li:hover {
    background: #111;
    color: #ccc;
}
```

---

## Tweakpane Theme Override Method

### Status-Based Theme Override

**Pattern:** Add `.tp-rotv` class + `data-status` attribute to enable per-blade theming

#### Implementation

**Step 1: Add class in TypeScript**

```typescript
// mirrors: modules/browser/src/widgets/system-status.ts
blade.element.classList.add('heat', 'tp-rotv');
// This allows overriding tweakpane theme for this blade

const applyTheme = () => (blade.element.dataset.status = hackedStatusColor[prop.getValue()]);
// This will change tweakpane theme for this blade, see tweakpane.css

panelCleanup.add(prop.onChange(applyTheme));
applyTheme(); // Apply immediately
```

**Step 2: Define overrides in CSS**

```css
/* In /static/styles/tweakpane.css */
:root [data-status='OK'] {
    --tp-base-background-color: hsl(123, 61%, 18%);  /* Green */
}
:root [data-status='WARN'] {
    --tp-base-background-color: hsl(52, 61%, 18%, 1);  /* Yellow */
}
:root [data-status='ERROR'] {
    --tp-base-background-color: hsl(0, 69%, 17%, 1);  /* Red */
}
```

#### Usage Locations

| File | Context |
|------|---------|
| `system-status.ts` | System status cells |
| `full-system-status.ts` | Full system status rows |
| `warp.ts` | Warp jam indicator |
| `tweak.ts` | System defectible folders |

#### Dynamic Application Pattern

```typescript
// Generic pattern used across codebase
systemFolder.element.classList.add('tp-rotv');

const applyThemeByStatus = () =>
    (systemFolder.element.dataset.status = system.getStatus());

// Reactive update
cleanup(prop.onChange(applyThemeByStatus));

// Initial application
applyThemeByStatus();
```

### Table Layout Override

**From tweakpane-table plugin:**

```css
:root .tp-lblv_v {
    min-width: fit-content;  /* Don't cut off cells */
}
:root .tp-grlv_g {
    width: 160px;  /* Cut off monitor cell */
}
```

**Manual Width Override (jQuery):**

```typescript
// mirrors: modules/browser/src/widgets/full-system-status.ts
container.getElement().find('.tp-lblv_v').css('min-width', 'fit-content');
container.getElement().find('.tp-lblv_l').css('min-width', `${systemNameWidth}px`);
```

---

## PixiJS Styling Hooks/Constants

### Central Color Constants

**File:** `modules/browser/src/colors.ts`

```typescript
import { Color, ColorSource } from 'pixi.js';

// ============================================================================
// Faction/Object Colors (PixiJS hex format: 0xRRGGBB)
// ============================================================================

export const white = 0xffffff;
export const red = 0xd53434;       // Enemy/Gravitas
export const blue = 0x404fc9;      // Friendly/Raiders
export const yellow = 0xe2b640;    // Neutral
export const green = 0x34d534;     // Target/Active
export const selectionColor = 0x00ffff;  // Pure cyan

// ============================================================================
// Radar Background Colors
// ============================================================================

export const radarVisibleBg = 0x0a0a0a;   // Dark gray (visible area)
export const radarFogOfWar = 0x1a1a1a;    // Medium gray (fog)

// ============================================================================
// Grid Colors (array for different grid levels)
// ============================================================================

export const gridColors = [
    0x00ffff,  // Main grid
    0x00cccc,  // Secondary
    0x009999,  // Tertiary
    0x006666,  // Quaternary
    0x003333,  // Quinary
    0xff6600   // Senary
];

// ============================================================================
// Conversion Utility for CSS Interop
// ============================================================================

/**
 * Converts PixiJS ColorSource to CSS hex string
 * @param color - PixiJS color (number, string, or Color object)
 * @returns CSS hex string (e.g., "#303030")
 */
export function toCss(color: ColorSource): string {
    if (typeof color === 'string') return color;
    if (typeof color === 'number') {
        return '#' + color.toString(16).padStart(6, '0');
    }
    return new Color(color).toHex();
}
```

### Usage in PixiJS Contexts

#### Direct Hex Usage (Most Common)

```typescript
// Fills and strokes
graphics.fill({ color: radarVisibleBg, alpha: 1 });
graphics.stroke({ color: red, width: 2 });

// Sprite tints
sprite.tint = green;
```

#### Dynamic Color Selection

```typescript
// Simple faction-based
const getColor = (s: SpaceObject) => {
    if (s.faction === Faction.NONE) return yellow;
    if (s.faction === shipDriver.state.faction) return blue;
    return red;
};

// Complex faction mapping
const getFactionColor = (faction: Faction) => {
    switch (faction) {
        case Faction.NONE:
        case Faction.FACTION_COUNT:
            return yellow;
        case Faction.Gravitas:
            return red;
        case Faction.Raiders:
            return blue;
    }
};
```

### RGB to Hex Conversion

**For dynamic color computation (e.g., health gradients):**

```typescript
// mirrors: modules/browser/src/widgets/armor.ts
const rgb2hex = (rgb: number[]) => {
    const r = Math.round(rgb[0] * 255);
    const g = Math.round(rgb[1] * 255);
    const b = Math.round(rgb[2] * 255);
    return (r << 16) | (g << 8) | b;
};

// Usage: health gradient from red to green
sprite.tint = rgb2hex([1 - health, health, 0]);
// health=0.0 → [1, 0, 0] → 0xff0000 (red)
// health=0.5 → [0.5, 0.5, 0] → 0x808000 (yellow)
// health=1.0 → [0, 1, 0] → 0x00ff00 (green)
```

### CSS Integration from PixiJS

```typescript
// mirrors: modules/browser/src/screens/engineer.ts
import { radarFogOfWar, toCss } from '../colors'; // line 14

container.getElement().css('background-color', toCss(radarFogOfWar));
// Converts: 0x1a1a1a → "#1a1a1a"
```

---

## Shared Token Import Pattern

### PixiJS Widgets (Most Common)

```typescript
import { blue, radarFogOfWar, radarVisibleBg, red, yellow } from '../colors';

// Usage throughout component
await root.initialize({ backgroundColor: radarFogOfWar }, container);

// ... later ...
graphics.fill({ color: radarVisibleBg, alpha: 1 });
```

### React/Arwes Components (Inline Styles)

**File:** `modules/browser/src/components/arwes-compat.tsx`

```typescript
// Color palette object (defined in ../colors and imported here)
const paletteColors = {
    primary: hsl.primary.main(3),   // hsl(180, 100%, 53%) — pure cyan
    secondary: hsl.secondary,       // hsl(24, 100%, 50%) — orange
    success: hsl.success,           // hsl(120, 50%, 40%)
    error: hsl.error,               // hsl(10, 50%, 48%)
    control: hsl.primary.main(3),   // hsl(180, 100%, 53%) — pure cyan
};

// Baseline theme
const stylesBaseline = {
    body: {
        backgroundColor: hsl.background,
        color: theme.colors.primary.main(3),  // pure cyan
        fontFamily: '"Titillium Web", sans-serif',
    },
};

// Component-level style injection
<style>{`
    .arwes-button--${colorKey} .arwes-frames-frame [data-name=line] {
        color: ${color};
    }
    .arwes-button--${colorKey}:hover:not(:disabled) [data-name=bg] {
        color: ${color}33;  /* 20% opacity hex suffix */
    }
`}</style>
```

### CSS Background Application

```typescript
// mirrors: modules/browser/src/screens/engineer.ts
import { radarFogOfWar, toCss } from '../colors';

container.getElement().css('background-color', toCss(radarFogOfWar));
// Converts: 0x1a1a1a → "#1a1a1a"
```

---

## Cross-Framework Color Mapping

| Token Name | PixiJS (hex) | CSS (rgb/hex) | Arwes (rgb) | Semantic Usage |
|-----------|--------------|---------------|-------------|----------------|
| **Primary Cyan** | `0x00ffff` | `#00ffff` | `hsl(180, 100%, 53%)` (`paletteColors.primary` = `hsl.primary.main(3)`) | Arwes primary, borders |
| **Success Green** | - | `hsl(120, 50%, 40%)` | `hsl(120, 50%, 40%)` | `hsl.success` / `paletteColors.success`; positive states |
| **Error Red** | - | `hsl(10, 50%, 48%)` | `hsl(10, 50%, 48%)` | `hsl.error` / `paletteColors.error`; error states |
| **Enemy Red** | `0xd53434` | `#d53434` | - | `red` (Enemy/Gravitas faction) |
| **Friendly Blue** | `0x404fc9` | `#404fc9` | - | Friendly faction |
| **Neutral Yellow** | `0xe2b640` | `#e2b640` | - | Neutral objects |
| **Active Green** | `0x34d534` | `#34d534` | - | Targets, OK status |
| **Selection Cyan** | `0x00ffff` | `#00ffff` | - | Selection highlight |
| **White** | `0xffffff` | `#ffffff` | - | Projectiles, text |
| **Radar BG Dark** | `0x0a0a0a` | `#0a0a0a` | - | Visible radar area |
| **Radar BG Fog** | `0x1a1a1a` | `#1a1a1a` | - | Fog of war |
| **Tweakpane BG** | - | `hsla(180, 10%, 8%, 1)` | - | Panel base |
| **Tweakpane OK** | - | `hsl(123, 61%, 18%)` | - | Green status |
| **Tweakpane WARN** | - | `hsl(52, 61%, 18%)` | - | Yellow warning |
| **Tweakpane ERROR** | - | `hsl(0, 69%, 17%)` | - | Red error |

### Hex Opacity Suffix Convention

Used in Arwes inline styles:

| Suffix | Opacity | Decimal | Usage |
|--------|---------|---------|-------|
| `33` | 20% | 0.2 | Light hover states |
| `66` | 40% | 0.4 | Active states |
| `99` | 60% | 0.6 | Focused states |
| `CC` | 80% | 0.8 | Primary content |

**Example:**
```typescript
color: ${color}33;  // 20% opacity
// If color = "rgb(33, 128, 141)", result is rgba(33, 128, 141, 0.2)
```

---

## Glow/Border Effects

### Arwes Frame Glows (SVG-based)

**Pattern:** Inline scoped styles per component

```typescript
// Inline style injection in component (from arwes-compat.tsx Card)
<style>{`
    .arwes-card .arwes-frames-frame [data-name=bg] {
        fill: ${withAlpha(theme.colors.primary.main(7), 0.25)};   /* Fill glow */
        stroke: ${withAlpha(theme.colors.primary.main(7), 0.5)};
        stroke-width: 1;
    }
    .arwes-card .arwes-frames-frame [data-name=line] {
        stroke: ${theme.colors.primary.main(7)};                  /* Border stroke */
        fill: none;
        stroke-width: 4;
    }
    .arwes-card:hover .arwes-frames-frame [data-name=line] {
        stroke: ${theme.colors.primary.high(2)};                  /* Hover glow */
        filter: drop-shadow(0 0 6px ${theme.colors.primary.main(3)});
    }
`}</style>

<ArwesFrameCorners strokeWidth={2} />
```

**SVG Targets:**
- `[data-name=line]` → Border stroke
- `[data-name=bg]` → Fill/glow background

### Tweakpane Borders (CSS)

```css
/* From tweakpane.css custom variables */
--tp-base-border-radius: 6px;
--tp-element-border-radius: 2px;
--tp-base-shadow-color: hsla(0, 0%, 0%, 0.2);
```

### PixiJS Glow Effects (Graphics Filters)

```typescript
import { AlphaFilter } from 'pixi.js';

// mirrors: modules/browser/src/screens/gm.ts — field of view overlay
fovGraphics.filters = [new AlphaFilter({ alpha: 0.1 })];

// Typical pattern for semi-transparent overlays
graphics.fill({ color: getFactionColor(faction), alpha: 1 });
fovGraphics.filters = [new AlphaFilter({ alpha: 0.1 })];
```

**Common Alpha Values:**
- `0.1` → Subtle overlay (FoV, backgrounds)
- `0.2` → Visible overlay (hover states)
- `1.0` → Opaque (primary elements)

---

## Font Hierarchy

| Context | Font Family | Usage |
|---------|-------------|-------|
| **Tweakpane** | Roboto Mono, Source Code Pro, Menlo, Courier | Control panels (via `--tp-font-family`) |
| **Arwes React** | Titillium Web | Body text (Lobby, Monitor, Damage Report) |
| **Arwes React** | Electrolize | Headers and emphasis |
| **PixiJS Labels** | Bebas | Radar text, range indicators |
| **Material Icons** | Material Icons | Icon buttons (zoom, menu controls) |
| **Golden Layout** | Arial, sans-serif | Tab labels, headers |

### Font Loading Methods

#### Via WebFontLoader (in widgets)

```typescript
import WebFont from 'webfontloader';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});
```

#### Via CSS @font-face (in index.css)

```css
@font-face {
    font-family: 'Bebas';
    src: url(../fonts/BebasNeue-Regular.ttf);
}

@font-face {
    font-family: 'Electrolize';
    src: url(../fonts/Electrolize-Regular.ttf);
}

@font-face {
    font-family: 'Titillium Web';
    src: url(../fonts/TitilliumWeb-Regular.ttf);
}
```

**Issue:** Multiple WebFont.load() calls scattered across widgets may cause loading race conditions.

---

## Opacity/Alpha Conventions

### By Framework

| Framework | Property | Range | Format |
|-----------|----------|-------|--------|
| **PixiJS** | `alpha` | 0.0-1.0 | Float |
| **CSS** | `opacity` | 0-1 | Float or `rgba()`/`hsla()` |
| **Arwes** | `opacity` | 0-1 | Inline style or hex suffix |

### Tweakpane Hover State Progression

| State | Alpha | Description |
|-------|-------|-------------|
| Idle | 0.1 | Resting state |
| Hover | 0.15 | Mouse over |
| Focus | 0.2 | Keyboard focus |
| Active | 0.25 | Pressed/selected |

### PixiJS Special Cases

| Context | Alpha | Purpose |
|---------|-------|---------|
| Faction FoV overlays | 0.1 | Subtle visibility indicator |
| Movement grid | 0.1 | Background reference |
| Selection highlight | 1.0 | Full visibility |
| Fog of war | 1.0 (solid color) | Obscured areas |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    STARWARDS VISUAL TOKENS                  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐   ┌──────────────────┐
│  colors.ts   │    │ tweakpane.css    │   │ arwes-compat.tsx │
│              │    │                  │   │                  │
│ • 0xRRGGBB   │    │ • CSS vars       │   │ • paletteColors  │
│ • toCss()    │    │ • [data-status]  │   │ • stylesBaseline │
│ • rgb2hex()  │    │ • :root override │   │ • inline <style> │
└──────────────┘    └──────────────────┘   └──────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────────┐   ┌──────────────────┐
│  PixiJS      │    │  Tweakpane       │   │  React/Arwes     │
│              │    │                  │   │                  │
│ • Graphics   │    │ • .tp-rotv class │   │ • <style> tags   │
│ • Sprites    │    │ • element.dataset│   │ • inline styles  │
│ • Filters    │    │ • .css() jQuery  │   │ • emotion/react  │
│ • fill()     │    │ • classList.add()│   │ • SVG frames     │
│ • stroke()   │    │                  │   │                  │
└──────────────┘    └──────────────────┘   └──────────────────┘

          ┌─────────────────────────────────┐
          │   Cross-Framework Utilities     │
          ├─────────────────────────────────┤
          │ • toCss(): 0xRRGGBB → "#RRGGBB" │
          │ • rgb2hex(): [r,g,b] → 0xRRGGBB │
          │ • Color.toHex() (PixiJS)        │
          │ • Hex suffix: 33=20%, 66=40%    │
          └─────────────────────────────────┘
```

### Data Flow

```
User Action
    ↓
State Change (Colyseus)
    ↓
    ├→ PixiJS Widget: Reads colors.ts → Updates graphics
    ├→ Tweakpane: Sets data-status → CSS vars override
    └→ Arwes: Injects inline styles → SVG frame colors
```

---

## Gaps and Recommendations

### Current Limitations

1. **No Centralized CSS Variables**
   - Colors defined separately in TypeScript (`colors.ts`) and CSS (`tweakpane.css`, `arwes-compat.tsx`)
   - No single source of truth for design tokens

2. **No Theme Switching**
   - Hard-coded dark theme only
   - No light theme or user preferences

3. **Hex Suffix Opacity Not Documented**
   - Convention (`33`=20%, `66`=40%) used but not formally defined
   - No type safety or validation

4. **Font Loading Timing Issues**
   - Multiple `WebFont.load()` calls scattered across widgets
   - Potential race conditions and duplicate loads

5. **No Design Token File**
   - Would benefit from single JSON/YAML source of truth
   - Current approach requires manual syncing across formats

### Recommendations for Design System

#### 1. Create Centralized Token File

**Proposed:** `/static/styles/tokens.css`

```css
:root {
    /* Faction Colors */
    --color-friendly: #404fc9;
    --color-enemy: #d53434;
    --color-neutral: #e2b640;
    --color-active: #34d534;
    --color-selection: #26dafd;

    /* Radar Colors */
    --color-radar-visible: #0f0f0f;
    --color-radar-fog: #303030;

    /* Status Colors */
    --color-status-ok: hsl(123, 61%, 18%);
    --color-status-warn: hsl(52, 61%, 18%);
    --color-status-error: hsl(0, 69%, 17%);

    /* Arwes Colors */
    --color-primary: rgb(126, 252, 246);
    --color-secondary: rgb(180, 144, 252);
    --color-success: rgb(33, 128, 141);
    --color-error: rgb(192, 21, 47);

    /* Opacity Levels */
    --alpha-subtle: 0.1;
    --alpha-hover: 0.15;
    --alpha-focus: 0.2;
    --alpha-active: 0.25;
}
```

#### 2. Document Hex Opacity Suffix

**Proposed:** Add to documentation

| Suffix | Opacity | Calculation |
|--------|---------|-------------|
| `1A` | 10% | Math.floor(255 * 0.1).toString(16) |
| `33` | 20% | Math.floor(255 * 0.2).toString(16) |
| `4D` | 30% | Math.floor(255 * 0.3).toString(16) |
| `66` | 40% | Math.floor(255 * 0.4).toString(16) |
| `99` | 60% | Math.floor(255 * 0.6).toString(16) |
| `CC` | 80% | Math.floor(255 * 0.8).toString(16) |

#### 3. Centralize Font Loading

**Proposed:** `modules/browser/src/fonts.ts`

```typescript
import WebFont from 'webfontloader';

let fontsLoaded = false;

export function loadFonts() {
    if (fontsLoaded) return Promise.resolve();

    return new Promise((resolve) => {
        WebFont.load({
            custom: {
                families: ['Bebas', 'Electrolize', 'Titillium Web'],
            },
            active: () => {
                fontsLoaded = true;
                resolve(undefined);
            },
        });
    });
}
```

**Usage:** Call once in app bootstrap.

#### 4. TypeScript Color Token Types

**Proposed:** `modules/browser/src/colors.ts`

```typescript
export type ColorToken =
    | 'friendly'
    | 'enemy'
    | 'neutral'
    | 'active'
    | 'selection'
    | 'radarVisible'
    | 'radarFog';

export const colorTokens: Record<ColorToken, number> = {
    friendly: 0x404fc9,
    enemy: 0xd53434,
    neutral: 0xe2b640,
    active: 0x34d534,
    selection: 0x26dafd,
    radarVisible: 0x0f0f0f,
    radarFog: 0x303030,
};

export function getColor(token: ColorToken): number {
    return colorTokens[token];
}
```

#### 5. Theme Variants Support

**Proposed Structure:**

```typescript
interface Theme {
    colors: Record<ColorToken, string>;
    fonts: Record<string, string>;
    spacing: Record<string, string>;
}

const darkTheme: Theme = { /* ... */ };
const lightTheme: Theme = { /* ... */ };

export function setTheme(theme: Theme) {
    // Apply CSS variables dynamically
}
```

---

## Implementation References

### Key Files

**Color Definitions:**
- `modules/browser/src/colors.ts` - PixiJS hex colors + conversion utilities
- `/static/styles/tweakpane.css` - Tweakpane CSS variables + status overrides
- `modules/browser/src/components/arwes-compat.tsx` - Arwes palette + inline styles

**Styling Applications:**
- `modules/browser/src/widgets/system-status.ts:107` - Tweakpane status theming
- `modules/browser/src/widgets/armor.ts:10` - RGB to hex conversion
- `modules/browser/src/screens/engineer.ts:69` - CSS background from PixiJS color

**Font Loading:**
- `/static/styles/index.css` - Font-face declarations
- `modules/browser/src/widgets/*.ts` - WebFontLoader calls

---

## Change History

