# Maintainer's guide

This document is the source of truth for the GitHub repo settings that
back the contribution-quality guardrails described in `CLAUDE.md` and
`AGENTS.md`. Apply these in **Settings → Branches → Branch protection
rules → master**.

## Required status checks

The following checks are required on `master`:

- `Test-Static` (includes `depcheck` — no separate job needed)
- `Test-Units`
- `Test-E2e`
- `Test-Visual`
- `coverage-core`

`pr-template-check` was retired (2026-07): checkbox attestation filled in
by the same LLM whose blindness it was meant to catch carries no evidence,
and routinely-bypassed red checks erode the "all CI must pass" norm. The
invariants it listed are enforced mechanically instead — `local/*` lint
rules in `eslint.config.mjs`, the runtime `@commandable` whitelist, and
the CI test jobs.

Set "Require branches to be up to date before merging" so the checks
have actually run on the merge commit's tree, not on stale parents.

## Required reviewers

- Require at least **1 review from a CODEOWNER**. CODEOWNERS is at the
  repo root.
- Enable **"Dismiss stale pull request approvals when new commits are
  pushed"**. This prevents an LLM from getting an approval, then quietly
  amending the PR.
- Enable **"Require review from someone other than the last pusher"**.

## Hotspot label gate

The `Labeler` workflow auto-applies the `risk:hotspot` label when a PR
touches any of:

- `modules/core/src/json-ptr.ts`
- `modules/core/src/game-field.ts`
- `modules/core/src/ship/ship-manager-abstract.ts`
- `modules/core/src/logic/space-manager.ts`
- `modules/server/src/ship/room.ts`

In branch protection, add a rule that **requires 2 approving reviews
when the `risk:hotspot` label is present**. GitHub does not yet support
this natively in branch protection; the recommended workaround is a
small `actions/github-script` job that fails the merge check while the
label is set and approval count < 2. (Track this as a follow-up — for
now, maintainers must enforce manually and respect the label.)

## Other settings

- **Disallow force pushes** to `master`.
- **Require linear history**.
- **Require signed commits** (recommended, not required).
- **Restrict who can push to matching branches** to maintainers only.
- **Do not allow bypassing the above settings** for admins.

## CODEOWNERS team setup

`CODEOWNERS` references `@starwards/maintainers`. Create that team in
the GitHub org and add maintainers to it. Until then, replace the team
with explicit `@username` entries so reviews are actually requested.

## Follow-up work

These items are independent of each other and can be tackled in any order.

### 1. Core kernel test backfill

The highest-risk source files have thin or no dedicated test coverage:

| File                   | LOC | Tests today        | What to cover                                                                                 |
| ---------------------- | --- | ------------------ | --------------------------------------------------------------------------------------------- |
| `space-manager.ts`     | 798 | 2 files (46 tests) | `setPosition`/`updateAABB` ordering; MapSchema delete semantics                               |
| `movement-manager.ts`  | 431 | 4                  | Dock alignment, additional thrust-vector edge cases (thrust/strafe/brake/afterburner covered) |
| `chain-gun-manager.ts` | 200 | 1 file (5 tests)   | Cooldown, jam, reload state machine (ammo decrement/switching covered)                        |

E2E gaps: a Playwright equivalent of the two-clients-on-same-ship scenario (one writes a `@commandable` property, the other observes). This scenario already has server-side coverage in `modules/server/src/test/multi-client-sync.spec.ts`; only a browser-level E2E remains outstanding.

### 2. Coverage ratchet

The `coverage-core` CI job is currently at 69% lines / 58% functions /
51% branches / 69% statements. Bump the thresholds by +5 points per
release until diminishing returns. The thresholds live in the
`test:coverage:core` script in the root `package.json`.

## Non-goal: malicious-player isolation

The `@commandable()` whitelist is **accidental-exposure protection**, not
adversarial-player containment.

Today's `ShipRoom` (`modules/server/src/ship/room.ts`) has no
connection-level GM-vs-player identity: GM and players join the same room
and send through the same `onMessage('*')` handler. The whitelist's
GM-side admissions (`@tweakable` + `DesignState`) are therefore reachable
from any client — a determined attacker can abuse the GM tweak surface
from a player seat.

This is an **accepted limitation** of the current architecture. The value
of the whitelist is that a contributor who adds a bare `@gameField` for
sync purposes does NOT get an accidental wire-write handle for free.
Closing the adversarial gap would require a connection-level role split
(`ShipRoom.onAuth`, distinct message channels, or session tokens) — a
scope that touches server, lobby, and every station screen. Starwards is
a LARP prop used among trusted players; that cost is not justified by the
threat model.
