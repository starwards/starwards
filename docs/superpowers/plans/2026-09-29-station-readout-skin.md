# Station Readout Skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implementers are Sonnet 5.5 subagents; each reads the spec, the mockups, and only its own task.

**Goal:** Restyle every Tweakpane panel as one glass-cockpit sci-fi readout skin, display-only on Helms/Weapons/Engineer/Signals, interactive on DRADIS/GM, and match station layouts, radars and Damage Report to the mockups.

**Architecture:** One rewritten `tweakpane.css` holds tokens and all blade styling; `<body data-input="none">` and `<body data-density="compact">` switch modes in CSS only. Station layouts are re-gridded in the screen files; radar colours move to `colors.ts` tokens.

**Tech Stack:** Tweakpane 4, PixiJS v8, React (Damage Report), Playwright E2E + gallery snapshots, `@fontsource`.

**Spec:** `docs/superpowers/specs/2026-09-29-station-readout-skin-design.md`
**Mockups:** `docs/design/mockups/station-readouts/*.dc.html` (open in a browser as plain HTML to read markup/CSS; `Main.dc.html` = component kit). They are reference, not code to import.

## Global Constraints

- `modules/browser/src/panel/blades.ts` public API unchanged (no new blade options, no signature changes).
- Every visual difference between screens is CSS, keyed on `<body>` attributes. No per-screen style logic in TS.
- Tweakpane-produced DOM unchanged; `data-id` on panes unchanged.
- DRADIS and GM keep full mouse/keyboard behaviour: no skin rule may block their pointer events. GM information density must not drop.
- Display stations keep only their existing hotkeys; no new input paths.
- Station target resolution 1024×768. Min text 11px; station values 16–30px.
- Palette (exact): ground `#03080b`, frame `#143a42`, accent `#5fe3f0`, title `#7fe7f2`, label `#52aebb`, value `#e6fcff`, caution `#ffb000`, warning `#ff3b30`.
- Faces: Chakra Petch (labels/titles, caps, letter-spaced), Share Tech Mono (values), bundled via `@fontsource`, no network fonts.
- Repo rules: read `CLAUDE.md` and `.claude/skills/starwards-station-ui`; Conventional Commits; no tombstones; commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Build before E2E: `npm run build:core && npm run build:server && npm --prefix modules/browser run build`.
- Never modify CI config or disable tests.

## Review Focus

1. **GM with many panels open** — compact density must keep every GM panel legible and clickable; nothing overlaps that did not before.
2. **Long labels/values** (e.g. "Radar traverse servo alignment", "rate of fire", "bearing skew") — truncate with ellipsis inside the column, never overflow into the neighbouring cell.
3. **Status transitions at runtime** — a cell going OK→WARN→ERROR→OK must re-render dark/amber/red/dark live, not only on first paint.
4. **DRADIS inputs** — typing in group name, picking colour, toggling layers still works after the skin (keyboard focus visible).
5. **Offline station** — fonts render with network disabled (no Google Fonts request in the network log).

Each item's test is placed in the owning task below.

---

### Task 1: Foundations — tokens, fonts, mode attributes

**Files:**
- Modify: `modules/browser/package.json` (pin `tweakpane` to exact installed version from lockfile; add `@fontsource/chakra-petch`, `@fontsource/share-tech-mono`), `package-lock.json`
- Modify: `static/styles/tweakpane.css` (replace `:root` token block only; keep existing rules working)
- Modify: `modules/browser/src/screens/station-screens.ts` (set `document.body.dataset.input = 'none'` for helms, weapons, engineer, signals; not dradis)
- Modify: `modules/browser/templates/sidebar.html` (`<body data-density="compact">`)
- Modify: `modules/browser/src/colors.ts` (add `status` export: ok/caution/warning matching the palette; make CSS values the same numbers)
- Font import: wherever browser entry CSS/JS is shared by all pages (find it; one import point)
- Test: `modules/e2e/test/input-mode.spec.ts` (new)

**Interfaces:**
- Produces: CSS custom properties on `:root` named `--sw-ground`, `--sw-frame`, `--sw-accent`, `--sw-title`, `--sw-label`, `--sw-value`, `--sw-caution`, `--sw-warning`, `--sw-font-label`, `--sw-font-value`, `--sw-fs-label`, `--sw-fs-value`, `--sw-fs-title`, `--sw-gap`, `--sw-pad`; compact overrides under `body[data-density="compact"]`. Body attributes `data-input="none"` and `data-density="compact"`. `status` export in `colors.ts`.

- [ ] **Step 1:** Write `input-mode.spec.ts`: for each of helms/weapons/engineer/signals assert `body[data-input="none"]` and that a pane (`[data-id="Systems Status"]` or first `.tp-rotv`) has computed `pointer-events: none`; for dradis and `gm.html` assert no `data-input` and a pane accepts pointer events. Plus Review Focus 5: record network requests on `weapons.html` and assert none go to `fonts.googleapis.com`/`fonts.gstatic.com`. Run → FAIL.
- [ ] **Step 2:** Implement tokens, attributes, fonts, `status` export, and `body[data-input="none"] .tp-rotv { pointer-events: none }`.
- [ ] **Step 3:** Run the new spec and the five station screen specs → PASS. `npm run test:types`.
- [ ] **Step 4:** Commit `feat(browser): station skin tokens, fonts and input-mode attributes`.

### Task 2: Blade skin

**Files:**
- Modify: `static/styles/tweakpane.css`
- Test: `modules/e2e/test/readout-skin.spec.ts` (new)

**Interfaces:**
- Consumes: Task 1 tokens and body attributes.
- Produces: final selectors for pane/folder titles (`.tp-rotv_t`, folder title), bars (`.sw-bar`), annunciators (`input[data-checked]` containers), used by Task 3.

Implement spec §3 mapping table except pane IDs and segmented bars (Task 3):
- Pane: ground-tinted background, 1px frame border, bracketed accent corners via pseudo-elements, no rounded corners; title caps letter-spaced in title colour.
- Label/value rows: label face/colour/caps; value mono, right-aligned, faint glow; long text ellipsis (Review Focus 2).
- `.sw-bar` and disabled sliders: tick-mark track, glowing accent fill, no knob (`expectNonInteractiveBar` must still pass).
- Checkbox → annunciator: dark outline when `data-checked="false"`, lit accent text/border when `"true"`; no check glyph.
- List → plain mode text, arrow hidden.
- `data-status=OK` → dark empty cell (text hidden); `WARN` → caution fill, dark text; `ERROR` → warning fill, dark text.
- Under `body[data-input="none"]`: hide buttons, fold arrows, list arrows, knobs.
- Without `data-input` (DRADIS, GM): buttons solid accent with clipped corners and hover state, text inputs with lit underline and focus ring, checkboxes as toggle switches — per `Dradis.dc.html`.
- Compact density: same look, smaller tokens.
- Scanline overlay on station bodies only (`body[data-input="none"]` and dradis), `pointer-events: none`.

- [ ] **Step 1:** Write `readout-skin.spec.ts`: (a) Review Focus 3 — on `weapons.html`, set a system to broken/over-heat on the server (use `gameDriver.getShip`), assert its `[data-status]` cell becomes ERROR/WARN styled (computed background equals warning/caution), then restore and assert it returns to dark; (b) Review Focus 2 — a long label cell in Repair Queue has `text-overflow: ellipsis` and its bounding box stays inside its row; (c) Review Focus 4 — on `dradis.html`, type into the New Waypoint group input and toggle a Layers checkbox; assert value/state changed. Run → FAIL where applicable.
- [ ] **Step 2:** Implement CSS.
- [ ] **Step 3:** Run new spec + all five station specs + `gm-screen.spec.ts` + `gm-game-controls.spec.ts` → PASS.
- [ ] **Step 4:** Screenshot each station and GM at 1024×768 (throwaway Playwright or gallery), compare to mockups, fix gaps. Delete any throwaway spec.
- [ ] **Step 5:** Commit `feat(browser): glass-cockpit readout skin for tweakpane`.

### Task 3: Pane IDs and segmented bars (CSS-only)

**Files:**
- Modify: `static/styles/tweakpane.css`

**Interfaces:**
- Consumes: Task 2 title and bar selectors; pane `data-id` values listed below.

- Pane IDs via `[data-id="…"] > .tp-rotv_t::after { content: "…" }` (or the correct title element), small mono, frame-dim colour, right-aligned in the title bar. Mapping: Helms — Systems Status `HLM-07`, Properties `HLM-01`, Reactor `HLM-04`, Warp `HLM-05`, Docking `HLM-06`; Weapons — Tubes Status `WPN-02`, Ammunition `WPN-03`, Chain Gun `WPN-04`, Targeting `WPN-05`, Systems Status `WPN-06`; Engineer — Engineering Status `ENG-01`, Warp `ENG-02`, Full Systems Status `ENG-04`, Repair Queue `ENG-05`; Signals — Scan Beam `SIG-01`, Signals Jobs `SIG-02`, Target `SIG-03`, Systems Status `SIG-04`; DRADIS — New Waypoint `DRD-01`, Layers `DRD-02`, Groups `DRD-03`, Edit Waypoint `DRD-04`. Panes shared by title across stations (Systems Status, Warp) are disambiguated by a body-level station attribute: add `document.body.dataset.station = stationType` in `station-screens.ts` (all five stations).
- Segmented bars via CSS `mask`/`repeating-linear-gradient` on the bar track for: tube "loading" rows, chain gun "loading", engineering "energy cells". Select by pane `data-id` + label text is not possible in CSS — select by row position within the pane or by an existing attribute; if neither is stable, report back rather than adding TS.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Verify visually on each station; run station specs → PASS.
- [ ] **Step 3:** Commit `feat(browser): pane ids and segmented bars in station skin`.

### Task 4: Station layout re-grid

**Files:**
- Modify: `modules/browser/src/screens/helms-screen.ts`, `weapons-screen.ts`, `engineer-screen.ts`, `signals-screen.ts`, `dradis-screen.ts`
- Modify if a position is missing: `modules/browser/src/container.ts`
- Test: existing station specs; `modules/e2e/test/visual/` screenshot review

Match each artboard's panel placement at 1024×768 (left column / radar centre / right column; Engineer's centre systems table; DRADIS full-bleed map with corner panels). Keep pane creation order rules (CLAUDE.md: the pane that must receive clicks is created last). Do not change which widgets appear on which station.
- [ ] **Step 1:** For each station, re-place panels; run its screen spec after each → PASS.
- [ ] **Step 2:** Screenshot each at 1024×768 and compare to its artboard; no panel overlaps another or the viewport edge.
- [ ] **Step 3:** Commit `feat(browser): re-grid station layouts to readout mockups`.

### Task 5: Radar restyle

**Files:**
- Modify: radar drawing under `modules/browser/src/radar/**` (tactical, helms, long-range, DRADIS, GM radar), `modules/browser/src/colors.ts` (`radar` object)
- Test: gallery radar scenes

Per spec §5: thin dim range rings (frame colour), dim range labels, cyan own-ship marker, translucent scan wedge with accent edge, amber lock box on the tracked target, bearing ring labels at label colour instead of bright cyan. All colours from `colors.ts`. No behaviour changes.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run test:widgets` locally; review radar diffs against mockup radars; expect baseline failures (regenerated in Task 8).
- [ ] **Step 3:** Commit `feat(browser): radar palette matches station readout skin`.

### Task 6: Damage Report restyle

**Files:**
- Modify: `modules/browser/src/widgets/damage-report.tsx` (and its styles)

Adopt tokens and faces: title as a pane title, entries in value mono, caution entries amber, info entries label colour, frame + bracketed corners matching panes. Keep `data-id="Damage Report"`.
- [ ] **Step 1:** Implement; run `engineer-screen.spec.ts` → PASS.
- [ ] **Step 2:** Commit `feat(browser): damage report uses readout skin`.

### Task 7: Baselines, full verification, GM density check

**Files:**
- Modify: `modules/e2e/test/visual/gallery.spec.ts-snapshots/**`

- [ ] **Step 1:** `npm run test:e2e -- --update-snapshots=all` and `npm run test:widgets -- --update-snapshots=all` (Windows); `npm run snapshots:ci` (Linux, docker). Review every changed image; reject any that do not match the mockups' intent.
- [ ] **Step 2:** Review Focus 1: open `gm.html` with all panels in its default layout plus Tweak/Properties panels at 1920×1080 and 1280×720; screenshot; confirm no clipping or overlap versus master. Report screenshots.
- [ ] **Step 3:** Full suite: `npm run test:types`, `npm run test:format`, `npm run knip`, `npm test`, `npm run test:e2e`. All pass.
- [ ] **Step 4:** Commit `test(e2e): regenerate gallery baselines for readout skin`.

## Order and parallelism

Task 1 → Task 2 → Task 3 (same CSS file, sequential). Tasks 4, 5, 6 can start after Task 3. Task 7 last.
