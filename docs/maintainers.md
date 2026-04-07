# Maintainer's guide

This document is the source of truth for the GitHub repo settings that
back the contribution-quality guardrails described in `CLAUDE.md` and
`AGENTS.md`. Apply these in **Settings → Branches → Branch protection
rules → master**.

## Required status checks

After PR1 lands, require:

- `Test-Static`
- `Test-Units`
- `Test-E2e`
- `Test-Visual`
- `pr-template-check`

After PR3 lands, additionally require:

- `coverage-core`
- `Test-Static` already runs `depcheck` (no separate job needed)

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

## Phase C — connection-level GM/player split (queued)

The `@commandable()` whitelist introduced in PR #1869 admits three
categories of wire-writable fields:

1. `@commandable()` — explicit player command surface.
2. `@tweakable` metadata — GM tweak panel writes.
3. `DesignState` subclass fields — GM design-state panel writes.

Categories 2 and 3 exist because the GM tweak and design-state panels
are the game-running tooling and need direct control over state during
a live session. Today's `ShipRoom`
(`modules/server/src/ship/room.ts`) has **no** connection-level
GM-vs-player identity: GM and players join the same room and send
through the same `onMessage('*')` handler, so the whitelist's GM
admissions are equally reachable from a malicious player client.

Phase C closes that gap:

1. **`ShipRoom.onAuth(client, options)`** — accept a session token or
   query parameter identifying the client as `gm` or `player`. Persist
   on `client.userData`.
2. **Role-aware `handleJsonPointerCommand`** — when the message comes
   from a `player` client, run the current full-strength `isCommandable`
   check; when it comes from a `gm` client, bypass the whitelist
   entirely. Either implement by passing the role through the
   `onMessage('*')` callback (Colyseus gives the client identity
   there), or by moving GM writes to a distinct message type that only
   GM connections handle.
3. **Client-side plumbing** — thread the role through the lobby React
   client (`modules/browser/src/components/lobby.tsx`) and each
   station's `joinOrCreate` call in `modules/core/src/client/`.
4. **Server-side enforcement** — reject `player` connections that
   attempt to claim `gm` without the correct session token.

Phase C is intentionally **out of scope for PR #1869** because the
scope crosses server, client, and lobby auth, and because landing it
incorrectly (e.g., making a player silently effective as a GM) is
worse than the current warn-only posture. Track as a separate PR.
