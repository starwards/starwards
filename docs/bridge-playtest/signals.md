# Signals station — current state

**Code:** `modules/browser/src/screens/signals.ts` (added in PR #1848,
commit `3b40c6d`, March 2026; spacebar help added in `e869297`).

The signals screen is **brand new** and intentionally a minimal first cut.
It is **not** the full ticket #1208 vision.

## Widgets on screen

| Region | Widget | Notes |
|---|---|---|
| Background (full screen) | `longRangeRadar` | range = 50,000m default; zoom presets [5k, 10k, 25k, 50k, 100k, 250k] |
| Top-left | `targetInfo` | Type, Faction, Distance, Bearing — updated every 200ms |
| Top-right | `systemsStatus` | filtered to `/radar` only |

The `longRangeRadar` widget:
- Shows zoom level overlay (top-right of canvas, e.g. "50km")
- Reacts to mouse wheel (with 200ms cooldown), header zoom buttons, **and** to
  `zoomEvents` from `screens/signals.ts`
- Per `fc54991`, applies scan-level gating: UFOs render as gray circles with
  no ID/sprite. BASIC/ADVANCED reveal sprite + ID. Same-faction always at
  least BASIC.

The `targetInfo` widget shows fixed fields and emits placeholder `—` when no
target is selected. Distance and bearing are recomputed from the target's
position vs own ship's position via `XY.difference`.

## Inputs wired (`wireInput` in signals.ts)

| Action | Key |
|---|---|
| Next Target | `]` |
| Prev Target | `[` |
| Clear Target | `'` |
| Zoom In | `=` |
| Zoom Out | `-` |
| Place Waypoint | `w` |

Target cycling iterates **all `Spaceship` objects in `spaceDriver.state`**,
filtered to `s.id !== shipId` (own ship). It is independent of the **weapons**
station's target — signals uses a local `SelectionContainer` (`stationTarget`),
weapons writes to `/weaponsTarget` on the ship.

`setupHotkeyHelp(input)` — **SPACE** opens the help modal.

## Recent merged PRs that affect this station

- `3b40c6d` — initial Signals screen (PR #1848): screen, target-info widget,
  hotkeys, lobby button, webpack entry, lobby/gm/ship registration.
- `e869297` — add spacebar hotkey help (PR #1875): missing in initial cut.
- `738753a` — fix prettier and eslint violations in signals screen (PR #1882).
- `fc54991` — scan-level visibility gating in `ObjectsLayer`; `longRangeRadar`
  passes `shipDriver.state.faction`. UFO blips render as anonymous gray dots.
- `02df1c0` — long-range radar widget (#1204, **effectively closed** even
  though `.issues/open/1204-...md` still exists from the Feb-28 export).

## Open MS3 ticket — what's NOT yet shipped vs what #1208 asks for

`#1208 Signals station` (still open) lists the full vision. Comparing to what
exists today:

### Widgets

| #1208 wants | Status today |
|---|---|
| Long range radar | ✅ shipped (`longRangeRadar`, 50k default) |
| Target info — Lvl0: Physics (distance, heading, rel.speed) | 🟡 distance + bearing exist; **relative speed missing**; "heading" of own ship vs target not shown |
| Target info — Lvl1: Faction, model | 🟡 Faction shown (always — not gated by scan level); **model missing** |
| Target info — Lvl2: Armor status, damage reports, list of systems | ❌ none |
| List of all signals jobs | 🟡 jobs system (#1206) implemented in core (SignalsJobManager + Signals.jobs queue), but no jobs-list widget on the signals screen yet |

### Hotkeys

| #1208 wants | Status today |
|---|---|
| Zoom in/out | ✅ `=` / `-` (also wheel + header buttons) |
| Next / prev target | ✅ `]` / `[` |
| Toggle filter: unknown only | ❌ no filter UI |
| Toggle filter: enemy only | ❌ no filter UI |
| Initiate scan on selected target | ❌ no jobs system (#1206) |
| Initiate hack on selected target (per system) | ❌ no jobs system (#1206), no #1207 hack mechanic on signals UI |
| Clear all jobs | ❌ no jobs system |

### State

| #1208 wants | Status today |
|---|---|
| Signals target state (client only) | ✅ `SelectionContainer` is client-side and independent of weaponsTarget |

## Dependency status against #1208

- `#1204` long range radar widget — ✅ **closed**; shipped via `02df1c0`
- `#1205` scan levels mechanic — ✅ **closed**; visibility gating +
  per-faction scan-level state shipped via `fc54991`. The **scan-progression**
  rules (active scanning that lifts UFO → BASIC → ADVANCED via player action)
  are explicitly out of scope for #1205 — they belong to #1206. Today scan
  level is GM-tweak-driven.
- `#1206` signals jobs system — core implemented (PR #1878): `SignalsJobManager`
  runs scan/hack jobs and promotes scan levels server-side. No player-facing UI
  wires the queue/submit commands yet, so jobs are not yet reachable from the
  signals screen.
- `#1207` hack mechanic — ✅ **closed**; the hack-effect side is in place,
  but #1208 expects the signals seat to *initiate* a hack via #1206 jobs,
  which doesn't exist yet.

## Factually-verifiable gaps (not opinions)

- Target info shows **Faction** unconditionally — no scan-level gating in
  `target-info.ts` (the radar gates display, but the side panel does not).
- No relative-speed readout for the selected target.
- No "model" readout (would need scan-level BASIC).
- No filter UI — cannot reduce target-cycle list to "unknown only" or
  "enemy only" as #1208 requires.
- No way to issue a scan job from the signals seat — scan levels can only
  be changed via GM tweak panel today.
- `targetInfo` polls every 200ms via `EmitterLoop` — distance/bearing are
  smooth-ish but not synced with the radar tick.
- Help modal lists 6 hotkeys + SPACE; no on-screen affordance for filters
  (because filters don't exist yet).
- Hotkeys overlap by intent with weapons (`]`/`[`/`'` for target cycling)
  but operate on **different** target containers. A novice may be confused
  if both stations announce a "target" and they don't agree.
