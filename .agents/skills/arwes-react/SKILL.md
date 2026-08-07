---
name: arwes-react
description: >
  Working with @arwes/react (1.0.0-next) sci-fi UI framework — frame components, Animator lifecycle,
  SVG styling, bleeps, and effects. Use this skill whenever modifying Arwes components, debugging
  invisible frames, styling frame SVGs, or adding new sci-fi UI elements. Also use when you see
  imports from @arwes/react or the arwes-compat.tsx compatibility layer.
version: 2026-02-28
related_skills:
  - react-version-migration (React/Arwes version compatibility)
  - starwards-station-ui (station screens use PixiJS/Tweakpane, NOT Arwes)
  - starwards-debugging (debug invisible frames, rendering issues)
---

# Arwes React (1.0.0-next) — Working Guide

This skill covers the @arwes/react framework as used in Starwards, including hard-won debugging
lessons from actual development. The installed version is `1.0.0-next.25020502`.

**Not compatible with**: React Strict Mode, React Server Components.

## The Compatibility Layer

Starwards wraps raw Arwes components in `modules/browser/src/components/arwes-compat.tsx`. This
provides an alpha.19-style API (Button, Card, FrameCorners, Text, etc.) on top of the 1.0.0-next
primitives. Always check arwes-compat.tsx before modifying UI components.

Colors come from `modules/browser/src/colors.ts` (the HSL palette system). The `theme` object
in arwes-compat.tsx references `hsl.primary`, `hsl.secondary`, etc.

---

## Frame Components

10 frame components available, all wrapping `FrameBase`:

| Component | Shape | Key Props |
|-----------|-------|-----------|
| FrameCorners | Corner brackets | `cornerLength`, `strokeWidth` |
| FrameOctagon | Clipped corners | `squareSize`, `leftTop/rightTop/rightBottom/leftBottom` |
| FrameNefrex | Asymmetric angled cuts + lines | `squareSize`, `smallLineLength`, `largeLineLength` |
| FrameKranox | Complex corner blocks | `squareSize`, `bgStrokeWidth` |
| FrameNero | Decorative corner blocks | `cornerLength`, `cornerWidth` |
| FrameLines | Horizontal/vertical lines | `largeLineWidth`, `smallLineWidth` |
| FrameHeader | Header decoration | `direction`, `align`, `contentLength` |
| FrameUnderline | Bottom underline | `squareSize` |
| FrameCircle | Circular with rotating deco | `separation`, `sideWidth` |

All frames share: `styled`, `animated`, `padding`, `strokeWidth`, `elementRef`, `className`.

---

## Critical Lesson: CSS Class Names

The SVG element rendered by FrameBase gets class **`arwes-frames-frame`** plus a component-specific
class like `arwes-frames-frameoctagon`.

**The class `arwes-react-frames-framesvg` does NOT exist.** This was a phantom class name that
appeared in early code but never matched anything. If you see it in CSS selectors, it's broken.

Correct CSS targeting pattern:
```css
/* Target frame SVG elements */
.my-wrapper .arwes-frames-frame [data-name=bg] { fill: ...; }
.my-wrapper .arwes-frames-frame [data-name=line] { stroke: ...; }
.my-wrapper .arwes-frames-frame [data-name=deco] { ... }
```

### SVG data-name Attributes

Frame SVGs contain elements with these `data-name` values:
- **`bg`** — Background fill path
- **`line`** — Border stroke paths (inside a `<g>` group)
- **`deco`** — Decorative flourishes (not all frames have these)

---

## The `styled` Prop

Controls whether Arwes applies its own inline styles via CSS variables.

**`styled={true}` (default):**
```
bg:   fill: var(--arwes-frames-bg-color, currentcolor)
line: stroke: var(--arwes-frames-line-color, currentcolor); fill: none
deco: color: var(--arwes-frames-deco-color, currentcolor)
```
Frames inherit color from parent via `currentcolor`. This is the safe default — frames are always
visible as long as the parent has a non-black `color`.

**`styled={false}`:**
All inline styles become `undefined`. SVG elements get browser defaults: `fill: black; stroke: none`.
On a dark background, this means **invisible frames**.

### When to use `styled={false}`

Only use it when you need full CSS control AND you have correct selectors targeting
`arwes-frames-frame`. Always verify frames are visible after switching to `styled={false}`.

If you just need to change colors, prefer keeping `styled={true}` and setting CSS variables:
```css
.my-component {
  --arwes-frames-bg-color: rgba(0, 255, 255, 0.1);
  --arwes-frames-line-color: hsl(180, 100%, 37%);
}
```

---

## The `animated` Prop

Controls entry/exit animations on frame elements.

- **`animated={true}` (default):** bg fades in, lines draw in (stroke-dasharray), decos fade in
- **`animated={false}`:** Frame appears instantly, no animation
- When `animated={true}`, the frame needs an Animator context to trigger animations

Animation types used internally:
- `['fade']` — Opacity transition
- `['draw']` — SVG stroke-dasharray draw effect

---

## Animator Wrapper Requirement

**Frames MUST be inside an `<Animator>` component** for proper rendering. FrameBase calls
`useAnimator()` internally and the `useEffect` that calls `createFrame()` depends on the animator
reference.

```tsx
// CORRECT
<Animator>
  <FrameOctagon strokeWidth={2} squareSize={10} />
</Animator>

// BROKEN - frame may not render or animate
<FrameOctagon strokeWidth={2} squareSize={10} />
```

The parent element must have `position: relative` so the absolutely-positioned SVG frame fills it.

### useFrameAssembler

Optional hook for coordinated assembly animations. Subscribes to Animator state and triggers
synchronized enter/exit across all frame sub-elements (bg, lines, decos staggered).

```tsx
const frameRef = useRef<SVGSVGElement>(null);
useFrameAssembler(frameRef);
// ...
<FrameOctagon elementRef={frameRef} ... />
```

Requires Animator context. Without it, the hook early-returns and does nothing.

---

## Debugging Invisible Frames

When a frame doesn't render, check in this order:

1. **Is there an `<Animator>` wrapper?** FrameBase needs animator context.
2. **Is `styled={false}`?** If yes, are CSS selectors using the correct class `arwes-frames-frame`?
3. **Does the parent have dimensions?** The SVG is `position: absolute; inset: 0` — parent needs
   `position: relative` and non-zero width/height. `createFrame` skips draw if width/height <= 0.
4. **Are colors too dark?** With `styled={true}`, frames use `currentcolor`. Check the parent's
   `color` property. With custom CSS, check lightness values against the background.
5. **Check browser DevTools:** Look for the `<svg class="arwes-frames-frame ...">` element. If it
   exists but has no child paths, the createFrame render didn't run. If paths exist but are
   invisible, it's a styling issue.

### How to Investigate Arwes Source

The compiled source is readable. Key paths in `node_modules/@arwes/`:

```
react-frames/build/esm/FrameBase/FrameBase.js     — SVG rendering, class names
react-frames/build/esm/Frame*/Frame*.js            — Component props → settings
frames/build/esm/createFrame*/create*.js           — SVG element definitions, styled/animated logic
frames/build/esm/createFrame/createFrame.js        — render/draw/transition lifecycle
frames/build/esm/internal/renderFrameElements.js   — data-name attributes, DOM creation
react-frames/build/esm/useFrameAssembler/          — Assembly animation hook
```

When documentation is unclear or missing, **read the settings factory** (e.g.,
`createFrameOctagonSettings.js`) to see exactly what SVG elements are created, what styles they
get, and what `data-name` values they use.

---

## Other Components

### Illuminator
Mouse-follow glow effect. Renders a `<div>` with class `arwes-frames-illuminator`.
```tsx
<Illuminator color="hsla(180, 100%, 26%, 0.1)" size={400} style={{ position: 'absolute', inset: 0 }} />
```
Use `clipPath` (e.g., `styleFrameClipOctagon()`) to constrain the glow to the frame shape.

### BleepsOnAnimator
Plays sounds on Animator state transitions. Renders nothing (null).
```tsx
<BleepsOnAnimator transitions={{ entering: 'intro' }} continuous />
```

### Text (ArwesText)
Animated text with character-by-character reveal. Wraps content in specified element.
```tsx
<ArwesText as="h2" style={{ ... }}>{title}</ArwesText>
```

### AnimatorGeneralProvider
Sets default animation durations for all nested Animators. Durations are in **seconds** (not ms).
```tsx
<ArwesAnimatorGeneralProvider duration={{ enter: 0.2, exit: 0.2, stagger: 0.04 }}>
```

### BleepsProvider
Provides sound effects. Maps player names to audio sources, bleeps to players.

---

## Common Patterns

### Frame with Custom Styling (recommended approach)
```tsx
<div className="my-panel" style={{ position: 'relative', padding: '16px' }}>
  <style>{`
    .my-panel .arwes-frames-frame [data-name=bg] {
      fill: hsla(180, 100%, 26%, 0.25);
    }
    .my-panel .arwes-frames-frame [data-name=line] {
      stroke: hsl(180, 100%, 37%);
      fill: none;
      stroke-width: 2;
    }
  `}</style>
  <Animator>
    <FrameOctagon strokeWidth={2} styled={false} />
  </Animator>
  {children}
</div>
```

### Frame with CSS Variables (simpler)
```tsx
<div style={{
  position: 'relative',
  '--arwes-frames-line-color': 'hsl(180, 100%, 37%)',
  '--arwes-frames-bg-color': 'hsla(180, 100%, 26%, 0.1)',
} as CSSProperties}>
  <Animator>
    <FrameCorners strokeWidth={2} />
  </Animator>
  {children}
</div>
```

### Hover Effects
Target the wrapper's hover state, not the frame itself:
```css
.my-wrapper:hover .arwes-frames-frame [data-name=line] {
  stroke: hsl(180, 100%, 84%);
  filter: drop-shadow(0 0 4px hsl(180, 100%, 53%));
}
```
