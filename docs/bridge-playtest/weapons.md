# Weapons station — current state

**Code:** `modules/browser/src/screens/weapons.ts` + widgets

## Widgets on screen

| Region | Widget | Notes |
|---|---|---|
| Background (full screen) | `tacticalRadar` | range = 5000m, with crosshairs from `chainGun` and speed lines |
| Top-right | `systemsStatus` | filtered to tubes, chainGun, magazine, radar |
| Top-left | `tubesStatus` | per-tube: ammo to use, ammo loaded, loading bar, safety-locked toggle, auto-load toggle |
| Middle-left | `ammoStatus` | per-projectile-type magazine count / max |
| Middle-right | `targetingStatus` | targetId + filter toggles (Ship Only, Enemy Only, Short Range) |
| Bottom-left | `gunStatus` | chainGun: projectile, loaded projectile, loading slider, auto-load |

`tactical-radar` shows own faction's field of view, ship's selected target,
chainGun crosshairs, and speed lines. Per `906c6fe`: own ship's cannon shells
bypass the range filter and are always rendered (so the weapons officer sees
their tracer fire even past sensor range).

## Inputs wired (`wireInput` in weapons.ts)

| Action | Key |
|---|---|
| Next Target | `]` |
| Prev Target | `[` |
| Clear Target | `'` |
| Toggle Ships Only | `p` |
| Toggle Enemy Only | `o` |
| Toggle Short Range Only | `i` |
| Fire Tubes (ship-level: every loaded, unlocked tube) | `x` |
| Toggle Tube 0/1/2/3 Safety (one dedicated key per tube index) | `1` `2` `3` `4` |
| Toggle Tube 0/1/2/3 Load/Unload (one dedicated key per tube index) | `Shift+1` `Shift+2` `Shift+3` `Shift+4` |
| Change Tube 0/1/2/3 Ammo (one dedicated key per tube index) | `Alt+1` `Alt+2` `Alt+3` `Alt+4` |
| Fire Chain Gun (every mount) | `f` |
| Toggle Load Chain Gun | `g` |
| Change Gun Ammo | `b` |

`setupHotkeyHelp(input)` — **SPACE** opens the help modal.
**No gamepad bindings on weapons** (pilot has gamepad, weapons is keyboard-only).

## Recent merged PRs that affect this station

- `906c6fe` — own cannon shells visible on tactical radar (closes #1002).
- `bb379fa` — clears `weaponsTarget` when target is out of radar range
  (closes #745 for the targeting case).
- `fc54991` — scan-level visibility for radar blips (#1205, **closed**):
  UFO objects (scanLevel < BASIC) render as gray circles with no ID/sprite.
  Same-faction objects always render at least BASIC. The `tactical-radar`
  widget passes `shipDriver.state.faction` to `ObjectsLayer`, so this gating
  is active here. *Caveat:* the **scan-level upgrade mechanism** (signals
  jobs that lift a target from UFO → BASIC → ADVANCED) is **not** part of
  this ticket — that's #1206 (still open). Today tier-1 (UFO → BASIC)
  auto-promotes after a 5s dwell (#1925); further
  promotion is GM-controlled via tweak panel.
- `3010cca` — chaingun widget wired into weapons station screen.
- `ba492f8` — interactive hotkey help modal (SPACE).
- closes #2089 — ship-level `fireTubesCommand` fires every loaded, unlocked
  tube (fixing tubes past index 0 being unreachable); each fired tube
  re-locks its own `safetyLocked` immediately. Chain-gun fire (`f`)
  generalizes the same way to every mount. Unlocking is per-tube via a
  dedicated hotkey (`1`-`4`) or the `tubesStatus` widget.

## Open tickets that could touch the weapons station

| Ticket | Status | Title | Weapons relevance |
|---|---|---|---|
| #745 | open (partial) | target view when out of radar range | server-side targeting clear shipped (`bb379fa`); ticket file still open — verify residual scope on GitHub |
| #833 | open, **no milestone** | combine armor plates with tactical radar (single-pilot) | optional — would render armor as a tactical-radar overlay so weapons officer sees self-armor without a separate widget |
| #1233 | ✅ closed (PR #1974) | broken status in damage report widget | done — `damage-report.tsx` now shows broken systems via `getBrokenSystems`; not a widget on this screen |
| #1206 | open (MS3, blocks #1208) | signals jobs system | indirect: when implemented, target scan-level is no longer GM-controlled — what weapons can identify will change dynamically |
| #1208 | open (MS3) | signals station | indirect — same as #1206; the dependency chain is the relevant part |

## Factually-verifiable gaps (not opinions)

- Tactical radar is fixed at 5000m (no zoom on weapons), but `tacticalRadar`
  source supports a `range` prop. Currently hard-coded in `screens/weapons.ts`.
- Targeting filters (`shipOnly`, `enemyOnly`, `shortRangeOnly`) appear both in
  the `targetingStatus` panel (as toggles) and as hotkeys (`p`, `o`, `i`) —
  same state shown twice with different controls.
- No on-screen ammunition-low warning. `ammoStatus` shows numeric `count / max`
  but no threshold styling.
- No in-flight missile/shell tracking widget — only chainGun loading bar and
  tube loading bar. Once fired, projectiles are only visible as radar blips.
- `targetingStatus` panel shows the raw `targetId` string (e.g. `R2D2`).
  No human-friendly label, faction badge, or distance — that information lives
  on the radar blip.
