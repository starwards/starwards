# Signals Station

> **See also:** [`docs/bridge-playtest/signals.md`](../../bridge-playtest/signals.md) — what shipped vs the full #1208 spec. [`docs/bridge-playtest/signals-design.md`](../../bridge-playtest/signals-design.md) — user-stated design intent that **shifts away from the queued-jobs model summarized below** toward an active mini-game framing for scan and cyber-attack. [`docs/MS3/SIGNALS_JOBS_DESIGN.md`](../../MS3/SIGNALS_JOBS_DESIGN.md) — detailed technical spec for the original queued-jobs design.

**Status:** Partial — a minimal first-cut Signals station has shipped (long-range radar, target info panel, /radar systems status, target cycling/zoom; see `modules/browser/src/screens/signals.ts` and `docs/bridge-playtest/signals.md`). The full queued-jobs vision (#1208/#1206 scan/hack/track job engine, target filters, Lvl2 target details) is not yet built.
**Crew role:** Intelligence Officer — scans, hacks, and tracks targets.
**Blocked by:** Scan levels mechanic, Signals jobs engine
**Issues:** [#1208](https://github.com/starwards/starwards/issues/1208), [#1206](https://github.com/starwards/starwards/issues/1206)

## What it does

The signals officer gathers intelligence on contacts and disrupts enemy systems. Three job types:

| Job               | Duration | Success Rate | Effect                                  |
| ----------------- | -------- | ------------ | --------------------------------------- |
| **Scan** (Lvl0→1) | 15-30s   | 70-90%       | Reveals faction and ship model          |
| **Scan** (Lvl1→2) | 30-60s   | 70-90%       | Reveals systems, damage, armor          |
| **Hack**          | 30-60s   | 50-70%       | 50% effectiveness reduction for 2-3 min |
| **Track**         | Instant  | 100%         | Target visible beyond line-of-sight     |

Job queue: max 9 jobs, sequential execution (FIFO). Malfunctions increase duration (+25%) and failure chance (+20%) per defect.

## Scan levels

| Level    | What you see                                                   |
| -------- | -------------------------------------------------------------- |
| UFO      | Distance, heading, speed                                       |
| BASIC    | + Faction, ship model                                          |
| FULL     | + Systems, damage, armor layout, tube loadout                  |
| SNAPSHOT | FULL frozen at the moment the faction lost sight of the target |

Built: the scan-job queue is automatic (#1992). Every visible contact below FULL gets a job, and a job raises its target one tier per 5 s of unbroken field of view from any of the ship's radars. Non-ships stop at BASIC, except missiles: a missile scan takes 1 s per tier and goes to FULL, which reads its warhead. Scan levels are faction-shared, and FULL drops to SNAPSHOT when the faction loses sight. The officer's levers are beam direction and arc, job priority, and pause; the beam extends reach only past the omni radar ([#2307](https://github.com/starwards/starwards/issues/2307)).

Missile paint (M4.26 ruling): on the Weapons, Helms and Signals radars an unscanned missile is a plain dot, a BASIC missile a hollow diamond labelled `MSL`, and at SNAPSHOT/FULL a filled diamond in its warhead's colour and code (`missileWarheadPaint` in `modules/browser/src/colors.ts`). Dradis shows no projectiles at all. Gallery scenes `missile-paint-*` pin all four radars.

Beam jamming (M4.27 ruling): holding `J` on the Signals station jams with the scan beam (momentary, like the chain-gun trigger; the beam's `jamming` field). While held the beam gains `jamHeatPerSecond` heat (default 20/s, against the 100 overheat ceiling), so jamming works in short bursts and the Scan Beam panel shows the beam's heat. Every FULL-scanned missile the beam covers gains `jamLevel` (0 to 1) at `1 / jamSeconds` per second (the missile's `jamSeconds`, default 1 s); out of every jamming beam it falls back towards 0 at the same rate. At 1 the missile is jammed: it permanently drops its target and affiliation, keeps its faction and owner ship, flies on, and locks onto (and sprints at) the nearest solid object — ship, asteroid or derelict, friend or foe, anything but its launcher — within its `jamLockRange` (default 1 km). Only crew jam: automation never sets `jamming`. Code: `modules/core/src/ship/beam-jam-manager.ts`, `SpaceManager.updateJamLevels`.

## Widgets

- Long-range radar (extended range, zoom in/out)
- Target info panel (content varies by scan level)
- Job queue with progress bars
- Target filtering (unknown-only, enemy-only)

## Dependencies

1. Scan levels mechanic must be built first (state model, faction sharing)
2. Signals jobs engine (queue execution, success/failure calculation)
3. Then the station UI can be wired up
