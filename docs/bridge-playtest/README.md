# Bridge Playtest — Gap Analysis Notes

Working folder for an internal-playtest gap analysis session.
The user is doing a bridge-only test run with novice volunteer players and will
make all design / scope decisions. This folder is **session continuity**, not a
spec or plan.
## Test run shape (as stated by user)

- **Format:** LAN party / bridge-only — distinct from the LARP format. See
  [game-formats note](#game-formats) below.
- **Session length:** 30–60 min playable
- **Crew:** 5 people / 4 stations — Pilot, Engineer (= Bridge Engineering),
  Weapons, Signal — plus a floating **Captain** with no station and no UI
  (see [interdependency-matrix.md §3a](interdependency-matrix.md))
- **Audience:** Volunteer testers, never played this kind of game
- **Goal includes:** Onboarding feedback (UX, learnability) in addition to gameplay
- **Timeline:** Tight
- **Out of scope here:** Navigator, **Relay** (cut for this session), dedicated
  Repair station, Dock Master, GM-as-a-station — all the post-bridge / LARP-
  only stations from MS3 PLAN.md
- **"Hardwired for completeness" systems:** Some bridge mechanics are present so
  the experience feels whole, not because they are the focus of testing.
  Repair (LAN-party variant) is the canonical example.

## Game formats

Starwards has two distinct play formats. Designs may have **two coexisting
variants** — one per format — sharing server-side primitives but differing
in input/output:

| Format | Where | Input | Status |
|---|---|---|---|
| **LAN party / bridge-only** | Same table, screens + keyboards | On-screen / keyboard | This playtest |
| **LARP** ("Mission in the Fringe") | Full event, dedicated stations, IoT props | Physical, network API | Tracked by `docs/MS3/PLAN.md` |

Repair is the canonical two-variant feature: bridge-engineering on-screen
mini-game (LAN-party) + dedicated IoT repair station #547 (LARP).

## Ground rules for this session

- Per-station: factual summary of what exists in code today + what planned
  tickets would add + clearly-flagged factual gaps
- **No design proposals from Claude.** No scope questions. No timeline asks.
- User decides direction; Claude reflects state.

## Cross-cutting design notes

- [decisions.md](decisions.md) — confirmed design decisions (promoted from proposals)
- [proposals.md](proposals.md) — candidate gap-closing moves (drafts; not yet decided)
- [plan.md](plan.md) — task plan for the next milestone (Daniel / user / Claude tracks; links agent-ready GitHub issues)
- [interdependency-matrix.md](interdependency-matrix.md) — foundational principle: bridge stations must form a rock-paper-scissors web of dependencies + a physical-comms layer; current matrix mapped from code

## Per-station notes

- [pilot.md](pilot.md)
- [weapons.md](weapons.md)
- [bridge-eng.md](bridge-eng.md) — `screens/ecr.ts` without `?station=ecr`; ECR-specific extras called out at the bottom
- [bridge-eng-design.md](bridge-eng-design.md) — user-stated design intent for adding **damage management** to bridge engineering; compared to current code (`@defectible` reflection, existing damage-report widget) and to #547 repair-station (location conflict flagged)
- [signals.md](signals.md) — minimal first cut (PR #1848); compares to full #1208 spec
- [signals-design.md](signals-design.md) — user-stated design intent for the signals station, compared to current code and to `SIGNALS_JOBS_DESIGN.md` (flags mini-game vs queued-jobs conflict)

## Reference docs in this repo

- `docs/MS3/PLAN.md` — full LARP roadmap (24-week scope, includes Navigator/Relay)
- `docs/MS3/SCAN_LEVELS_DESIGN.md`
- `docs/MS3/SIGNALS_JOBS_DESIGN.md`
- `.issues/milestones/1-mission-in-the-fringe-features.md` — open/closed tally
- `.issues/open/*.md` — per-ticket files

## Caveat: ticket-status staleness

The `.issues/` folder is a markdown export from GitHub dated **2026-02-28**.
PRs merged after that date may have closed tickets without the file being
moved from `open/` to `closed/`. The per-station notes flag the ones I could
verify — `#1187` and `#1204` ship in code but their files are still in
`open/`. When in doubt, check GitHub directly.
