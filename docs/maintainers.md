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
- `pr-template-check`
- `coverage-core`

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
- `modules/core/src/space/space-manager.ts`
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

### 1. `modules/core` public/internal barrel split

`modules/core/src/index.ts` re-exports everything — any consumer can
import internal classes and break on refactors. The goal is to trim
`index.ts` to externally-needed symbols only and move the rest to
`index.internal.ts` (the file and the `exports` field in `package.json`
already exist). `modules/server` and `modules/node-red` would import
internals from `@starwards/core/internal`; `modules/browser` stays on
`@starwards/core` (enforced by the dependency-cruiser rule
`no-core-internal-from-browser`).

### 2. Core kernel test backfill

The highest-risk source files have thin or no dedicated test coverage:

| File                       | LOC  | Tests today | What to cover                                                                                                       |
| -------------------------- | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `ship-manager-abstract.ts` | 281+ | 0 dedicated | `syncShipProperties` source-of-truth invariant; command-field reset (afterBurnerCommand, rotationModeCommand, etc.) |
| `space-manager.ts`         | 695  | 4           | `setPosition`/`updateAABB` ordering; MapSchema delete semantics; object lifecycle add/remove                        |
| `movement-manager.ts`      | 431  | 0 dedicated | Thrust vectors, brake, afterburner, dock alignment — pure math kernel                                               |
| `chain-gun-manager.ts`     | 200  | 0 dedicated | Ammo decrement, cooldown, jam, reload state machine                                                                 |

E2E gaps: `gm-screen.spec.ts` (GM station round-trip), `multi-client-sync.spec.ts` (two clients on same ship, one writes `@commandable` property, the other observes).

### 3. Coverage ratchet

The `coverage-core` CI job starts at 40% lines / 40% functions / 30%
branches / 40% statements. After the test backfill above lands, bump
the thresholds by +5 points per release until diminishing returns. The
thresholds live in the `test:coverage:core` script in the root
`package.json`.

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
