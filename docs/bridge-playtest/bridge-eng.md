# Bridge Engineering — current state

**Code:** `modules/browser/src/screens/ecr.ts`. The same module powers two
stations, switched by URL param `?station=ecr`:

- **Bridge Engineering** (default, no `?station=ecr`)
- **ECR / Engineering Control Room** (with `?station=ecr`)

This note covers the **Bridge Engineering** mode; ECR-specific differences are
called out at the bottom.

A runtime flag `/ecrControl` (server state) decides which of the two seats
**actually controls** power and coolant. The non-controlling seat still
displays the same widgets but its hotkeys are detached
(`controlledInput.destroy()` in `ecr.ts:152`).

## Widgets on screen (both modes)

| Region | Widget | Notes |
|---|---|---|
| Top-left | `engineeringStatus` | reactor energy graph, after-burner fuel graph, control = "ECR" or "Bridge" indicator |
| Middle-left | `warpStatus` | actual/designated warp level, jam indicator, actual/designated frequency, calibration |
| Middle-middle | `fullSystemsStatus` | per-system table: status / power / EPM / heat / coolant slider / hacked, plus per-defectible row |
| Bottom-left | `armorStatus` | dragonfly armor SVG, plate-health colored red→green |

Background is set to `radarFogOfWar` (dark) per `ecr.ts:69`.

## Inputs wired (`wireInput` in ecr.ts)

The screen iterates `shipDriver.systems` and pairs each system with a
keyboard pair from a 19-pair list. Pairs are assigned in the order systems
are returned by `shipDriver.systems`. Per system:

- `<key1>` / `<key2>` — Power down / up (step `PowerLevelStep`)
- `Shift+<key1>` / `Shift+<key2>` — Coolant down / up (step 0.1)

The 19 keyboard pairs available (in order):
`1/q, 2/w, 3/e, 4/r, 5/t, 6/y, 7/u, 8/i, 9/o, 0/p, a/z, s/x, d/c, f/v, g/b, h/n, j/m, k/comma, l/period`

This means the mapping a player sees depends on **which systems the ship has
and the order they're enumerated**. There is no fixed key-to-system contract
visible in the source code on this screen.

`setupHotkeyHelp(...)` — **SPACE** opens the help modal. The modal is
re-rendered when `/ecrControl` flips, since `controlledInput` is
init/destroyed in response.

The ECR-only inputs are also added when `?station=ecr`: see ECR section below.

## What `/ecrControl` does

- Server state property, toggleable.
- When the local station's `isEcr` matches the current `/ecrControl` value,
  `controlledInput.init()` runs — power/coolant hotkeys take effect.
- When it doesn't match, `controlledInput.destroy()` — hotkeys do nothing.
- The `engineeringStatus` widget shows the current owner ("ECR" or "Bridge")
  via the `control` blade.

So both seats see the same systems table at all times. Only one seat at a
time can change power/coolant.

## Recent merged PRs that affect this station

- `c9c9a15` — replace `[number, number]` literals with `Tuple2/RTuple2` types.
  No user-visible change; type cleanup.
- `1a8f91c` — switch ship between PC and NPC. Affects whether engineering
  hotkeys are connected on a given ship.
- `df83f2f` — hull damage system (#1187, **effectively closed**); **not
  surfaced in this screen** (no game-logic effect, GM-controlled, intended
  for IoT).
- `b52593d` — public/internal API boundary for `@starwards/core`. May affect
  available imports but no UX change.

## Open MS3 tickets that could touch this station

| Ticket | Status | Title | Bridge-Eng relevance |
|---|---|---|---|
| #1233 | ✅ closed (PR #1974) | broken status in damage report widget | `damage-report.tsx` now renders broken systems via `getBrokenSystems`; `fullSystemsStatus` already showed `broken` via `statusChangeProps` |
| #968 | open | Armor adjustments | armor is now layered continuous per-plate/per-layer health (`ArmorPlate`/`ArmorLayer` in `armor.ts`, PR #1932) — would change `armorStatus` rendering |
| #788 | open | QA armor behavior | testing/validation only |
| #1239 | open | composition vs inheritance refactor | architectural; no direct UI change but flagged as high risk in MS3 PLAN |

## ECR-specific additions (when `?station=ecr`)

A second `InputManager` (`ecrControlInput`) is registered, always live:

| Action | Key |
|---|---|
| Toggle ECR Control | `` ` `` |
| Warp Frequency down / up | `[` / `]` |
| Change Frequency (commit standby → current) | `\` |

The warp frequency control sets `/warp/standbyFrequency` within
`[0, WarpFrequency.WARP_FREQUENCY_COUNT - 1]`. Actual frequency change happens
on the `Change Frequency` command.

## Factually-verifiable gaps (not opinions)

- The **key-to-system mapping is order-dependent**. The hotkey help modal
  will show correct labels at runtime, but the mapping is not documented in
  source and changes if the system list changes.
- `engineeringStatus` shows energy and after-burner-fuel graphs but no
  threshold/warning styling.
- The `control` blade ("ECR" / "Bridge") is the only visible cue for who
  controls. If both seats are open, the non-controlling seat looks
  identical to the controlling one except hotkeys silently do nothing.
- `fullSystemsStatus` exposes coolant as an editable slider in the table —
  same control surface for ECR and Bridge in the markup, but only the active
  seat can change it via hotkeys. (Verify if drag is also gated.)
- Warp frequency display lives only on engineering screens. Pilot/Weapons
  cannot see current frequency.
- No in-screen indication of overheat or system disable other than the
  per-row `Status` color and `Heat` text.
