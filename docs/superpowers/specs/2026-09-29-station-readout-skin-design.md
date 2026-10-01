# Station readout skin — design

## Intent

Player station screens run on dedicated 1024×768 computers with no keyboard, mouse or touch (except DRADIS). Today's Tweakpane panels are hard to read, visually eclectic, and look clickable. Goal: display-only readouts with a glass-cockpit (Lockheed) feel and a sci-fi finish, applied as one skin.

Reference mockups: `docs/design/mockups/station-readouts/*.dc.html` (live canvas: https://claude.ai/artifact/CxGNtuAqHn2CXr6kkEKQVk). `Main.dc.html` is the component kit; the rest are per-station layouts.

## Constraints

- **One solution.** A single Tweakpane skin used by every screen. The `modules/browser/src/panel/blades.ts` API stays as is.
- **Every visual difference is CSS.** Mode switches (display vs interactive, compact density) are `<body>` attributes; no per-screen style logic in TypeScript.
- **Interactive screens stay interactive:** DRADIS and GM keep full mouse/keyboard behaviour. GM must keep its information density.
- `ship.html` (legacy) may change freely.
- DOM produced by Tweakpane stays unchanged, so E2E helpers (`getPropertyValue`, `expectNonInteractiveBar`, `data-id` selectors) keep working.

## Design

### 1. Skin structure

- `static/styles/tweakpane.css` is rewritten as the skin. Tokens on `:root`: palette, type faces, type scale, spacing.
- `<body data-input="none">` on Helms, Weapons, Engineer, Signals — set in `modules/browser/src/screens/station-screens.ts` per station type. Under it: `pointer-events: none` on panes; hidden slider knobs, checkbox chrome, list arrows, buttons, fold arrows.
- `<body data-density="compact">` on GM and ship (`templates/sidebar.html`). Scales size/spacing tokens down only; no behaviour change.
- DRADIS gets neither attribute: same skin, with visible interactive affordances (filled buttons, underlined inputs, toggle switches) per `Dradis.dc.html`.

### 2. Palette and type

| Token | Value | Use |
|---|---|---|
| ground | `#03080b` | background |
| frame | `#143a42` | rules, borders |
| accent | `#5fe3f0` | fills, lit annunciators, corners |
| title | `#7fe7f2` | pane titles, mode text |
| label | `#52aebb` | field labels |
| value | `#e6fcff` | live values, faint glow |
| caution | `#ffb000` | WARN |
| warning | `#ff3b30` | ERROR |

Faces: Chakra Petch (labels, titles; caps, letter-spaced) and Share Tech Mono (values), bundled via `@fontsource` packages (stations may be offline). Minimum text 11px; values 16–30px at station density. Faint scanline overlay on station body. Status colours in `colors.ts` (`hsl`) and the CSS must agree; add a `status` export if needed rather than hard-coding twice.

### 3. Blade → readout mapping (selectors only)

| Tweakpane element | Readout |
|---|---|
| slider / `.sw-bar` | bar with tick marks, glowing fill, no knob |
| bar marked as a count (e.g. loading) | segmented bar via CSS mask |
| checkbox (`data-checked`) | annunciator: dark when false, lit cyan when true |
| list / dropdown | plain mode text, no arrow |
| `data-status=OK` | dark, empty cell (dark-cockpit) |
| `data-status=WARN` / `ERROR` | amber / red fill, dark text |
| pane and folder title | caps, letter-spaced, bracketed corners (pseudo-elements) |
| text value | monospace, right-aligned |
| pane IDs (`WPN-02`, …) | `[data-id="…"] .tp-rotv_t::after { content }` |

Which bars are segmented is decided by selector (`data-id` + label), not by new blade options.

### 4. Station layouts

Re-grid each fixed station's panel placement to match its artboard at 1024×768: `helms-screen.ts`, `weapons-screen.ts`, `engineer-screen.ts`, `signals-screen.ts`, `dradis-screen.ts`. Use the existing `wrapRootWidgetContainer` / `subContainer` system; extend it if a position is missing. Radar stays full-bleed behind panels where the artboard shows it so.

### 5. Radars

Restyle PixiJS radar drawing to match the mockups: thin dim range rings, dim range labels, cyan own-ship marker, translucent scan wedge with cyan edge, amber lock box on the tracked contact, reduced bearing-ring brightness. Colours come from `colors.ts`. Applies to tactical, helms, long-range and DRADIS radars; GM radar follows the same palette.

### 6. Damage Report

The React/Arwes `damage-report.tsx` adopts the same tokens and faces (caution text amber, info text label colour) so it no longer reads as a different product.

### 7. Writable blades on display stations

The six writable panel controls on display stations (Signals scan-beam sliders, jobs-paused checkbox, Prioritize Target and job Cancel buttons; Weapons tube safety lock and cluster warhead) become inert through `data-input="none"`. Only existing hotkeys remain; adding input paths is out of scope. `data-input="none"` never applies to DRADIS or GM, whose mouse events stay untouched.

## Testing

- Existing E2E suite passes unchanged.
- New E2E: on a display station, panes do not receive pointer events; on DRADIS and GM they do.
- Gallery baselines regenerated for both projects (`test:e2e` and `test:widgets`), Windows and Linux (`npm run snapshots:ci`), reviewing diffs visually against the mockups.
- `npm run test:types`, `npm run test:format`, `npm run knip`, `npm test` pass.

## Risks

- Tweakpane internal class names (`.tp-sldv_k`, `.tp-ckbv`, `.tp-lstv`, `.tp-rotv_t`) are undocumented. `tweakpane` is `^4.0.5` in `modules/browser/package.json`, held by the lockfile; pin exactly to avoid silent breakage.
- GM density: compact tokens must be checked on the GM screen with its panels open.
