# Pilot station — current state

**Code:** `modules/browser/src/screens/pilot.ts` + widgets in
`modules/browser/src/widgets/`

## Widgets on screen

| Region | Widget |
|---|---|
| Background (full screen) | `pilotRadar` |
| Top-right | `systemsStatus` — filtered to thrusters, warp, radar, maneuvering, smartPilot |
| Top-left | `pilotStats` |
| Middle-right | `warpStatus` |
| Bottom-right | `dockingStatus` |
| Bottom-left | `armorStatus` (200px) |

## Inputs wired (`wireInput` in pilot.ts)

| Action | Keyboard | Gamepad |
|---|---|---|
| Rotation | Q / E | axis 0 (deadzone ±0.1) |
| Strafe | A / D | axis 2 (deadzone ±0.1) |
| Boost | W / S | axis 3 (deadzone ±0.1, inverted) |
| Reset Rotation Offset | — | button 14 |
| Rotation Mode toggle | — | button 10 |
| Maneuvering Mode toggle | — | button 11 |
| Afterburner | — | button 6 |
| Anti-Drift | — | button 7 |
| Brakes | — | button 5 |
| Warp Up | R | — |
| Warp Down | F | — |
| Toggle Dock | Z | — |

`setupHotkeyHelp(input)` registers a **SPACE**-key modal listing all of the above.

## Recent merged PRs that affect this station

- `db9cfc5` — `getVelocityCapacity` now matches actual physics in
  `updateVelocityFromThrusters`. Pilot velocity readouts/predictions are no
  longer optimistic.
- `5e1cbe5` — radar `malfunctionRangeFactor` reset in `resetShipState` (closes
  #866). Fixes radar range bugs across game restarts.
- `bb379fa` — clear weapons target when out of radar range (closes #745 partially
  — see open ticket section).
- `906c6fe` — own cannon shells visible on tactical radar (closes #1002).
  **NB:** pilot uses `pilotRadar`, not `tactical-radar`. Verify whether the fix
  also propagates here.
- `ba492f8` — interactive hotkey help modal for all input controls.
- `df83f2f` — hull damage system (#1187, **effectively closed** even though
  `.issues/open/1187-...md` still exists from the Feb-28 export). Implemented
  as state property + GM-controlled flag. Per ticket it has *no game-logic
  effect* and is intended for IoT alert routing only.

## Open tickets that could touch the pilot station

| Ticket | Status | Title | Pilot relevance |
|---|---|---|---|
| #745 | open (partial fix shipped) | address target view when out of radar range | server-side weaponsTarget clear shipped (`bb379fa`); the alternative "frontend stops tracking" path may still be open. Verify on GitHub. |
| #833 | open, **no milestone** | combine armor plates with tactical radar (single widget) | weapons-station scoped, but if generalized would replace the bottom-left armor block on pilot too |

## Factually-verifiable gaps (not opinions)

- No on-screen indicator of current Rotation Mode / Maneuvering Mode — the
  toggles are momentary buttons with no visible state on the pilot screen.
- The SPACE-key hotkey help modal is the only built-in onboarding affordance.
- Warp frequency is **not** displayed on pilot — it lives on engineering
  (`screens/ecr.ts` shows it). Pilot only sees Warp Up/Down outcomes via
  `warpStatus`.
- `#745` server-side target clear shipped via `bb379fa`, but the ticket file
  is still in `.issues/open/`. Verify on GitHub whether the issue is fully
  closed; in particular, verify whether the **pilot-radar** target marker
  clears too, or only the weapons-station target.
