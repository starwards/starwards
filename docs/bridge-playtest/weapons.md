# Weapons station — current state

**Code:** `modules/browser/src/screens/weapons.ts` + widgets

## Widgets on screen

| Region | Widget | Notes |
|---|---|---|
| Background (full screen) | `tacticalRadar` | range = 5000m, with crosshairs from `chainGun` and speed lines |
| Top-right | `systemsStatus` | filtered to tubes, chainGun, magazine, radar |
| Top-left | `tubesStatus` | per-tube: ammo to use, ammo loaded, loading bar, auto-load toggle |
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
| Fire Tube | `x` |
| Toggle Load Tube | `c` |
| Change Tube Ammo | `v` |
| Fire Chain Gun | `f` |
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
  this ticket — that's #1206 (still open). Today scan level is GM-controlled
  via tweak panel.
- `3010cca` — chaingun widget wired into weapons station screen.
- `ba492f8` — interactive hotkey help modal (SPACE).

## Open tickets that could touch the weapons station

| Ticket | Status | Title | Weapons relevance |
|---|---|---|---|
| #745 | open (partial) | target view when out of radar range | server-side targeting clear shipped (`bb379fa`); ticket file still open — verify residual scope on GitHub |
| #833 | open, **no milestone** | combine armor plates with tactical radar (single-pilot) | optional — would render armor as a tactical-radar overlay so weapons officer sees self-armor without a separate widget |
| #1233 | open (MS3) | broken status in damage report widget | adds offline indicator; affects `systemsStatus` (visible top-right) and any other damage-report widget if used |
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
