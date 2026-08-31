# Engineering — current state

**Code:** `modules/browser/src/screens/engineer.ts`. One station, one screen:
`engineer.html`. The engineer station holds full control of power, coolant and
warp frequency.

## Widgets on screen

| Region | Widget | Notes |
|---|---|---|
| Top-left | `engineeringStatus` | reactor energy graph, after-burner fuel graph, hull status |
| Middle-left | `warpStatus` | actual/designated warp level, jam indicator, actual/designated frequency, calibration |
| Middle-middle | `fullSystemsStatus` | per-system table: status / power / EPM / heat / coolant slider / hacked, plus per-defectible row |
| Bottom-left | `armorStatus` | dragonfly armor SVG, plate-health colored red→green |

Background is set to `radarFogOfWar` (dark) per `engineer.ts`.

## Inputs wired (`wireInput` in `engineer.ts`)

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

`setupHotkeyHelp(...)` — **SPACE** opens the help modal.

On the same input manager, whenever the ship has a warp drive:

| Action | Key |
|---|---|
| Warp Frequency down / up | `[` / `]` |
| Change Frequency (commit standby → current) | `\` |

The warp frequency control sets `/warp/standbyFrequency` within
`[0, WarpFrequency.WARP_FREQUENCY_COUNT - 1]`. Actual frequency change happens
on the `Change Frequency` command.

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
- #2133 — merged the ECR and Bridge-Engineer stations into one `engineer`
  seat and removed the `/ecrControl` control-authority toggle.

## Open MS3 tickets that could touch this station

| Ticket | Status | Title | Engineer relevance |
|---|---|---|---|
| #1233 | ✅ closed (PR #1974) | broken status in damage report widget | `damage-report.tsx` now renders broken systems via `getBrokenSystems`; `fullSystemsStatus` already showed `broken` via `statusChangeProps` |
| #968 | open | Armor adjustments | armor is now layered continuous per-plate/per-layer health (`ArmorPlate`/`ArmorLayer` in `armor.ts`, PR #1932) — would change `armorStatus` rendering |
| #788 | open | QA armor behavior | testing/validation only |
| #1239 | open | composition vs inheritance refactor | architectural; no direct UI change but flagged as high risk in MS3 PLAN |

## Factually-verifiable gaps (not opinions)

- The **key-to-system mapping is order-dependent**. The hotkey help modal
  will show correct labels at runtime, but the mapping is not documented in
  source and changes if the system list changes.
- `engineeringStatus` shows energy and after-burner-fuel graphs but no
  threshold/warning styling.
- `fullSystemsStatus` exposes coolant as an editable slider in the table;
  power/coolant hotkeys always take effect on this screen now that there is
  a single seat.
- Warp frequency display lives only on the engineer screen. Pilot/Weapons
  cannot see current frequency.
- No in-screen indication of overheat or system disable other than the
  per-row `Status` color and `Heat` text.
