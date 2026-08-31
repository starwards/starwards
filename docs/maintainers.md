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

## Related

- Test-coverage backfill targets and the coverage ratchet: [testing/coverage-strategy.md](testing/coverage-strategy.md)
- Why the `@commandable()` whitelist is not adversarial containment: [design/decisions/014-commandable-is-not-containment.md](design/decisions/014-commandable-is-not-containment.md)
