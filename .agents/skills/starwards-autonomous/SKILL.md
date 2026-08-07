---
name: starwards-autonomous
description: Use when running as an autonomous developer agent picking up agent-ready issues — controls issue selection, tool bootstrapping, exploration budget, skill loading, narration suppression, and verification discipline for unattended execution
---

# Autonomous Developer Protocol

You are running **unattended**. No human will read your narration. Execute directly.

## Rules

1. **No narration.** Never write "I'll start by...", "Let me now...", "I should...". Just do it.
2. **No preamble.** No greetings, no summaries of what you're about to do.
3. **Skills are mandatory.** You MUST invoke `starwards-tdd` before writing any code. You MUST invoke `starwards-verification` before committing.
4. **Budget your exploration.** You have a finite context window. Your first `Edit` or `Write` call should happen within 30% of your session. If you're still reading code past that point, you're over-exploring.

## Phase 0: Bootstrap (do this FIRST, before anything else)

**`gh` CLI is the primary GitHub interface** — but in the cloud sandbox, the GitHub proxy blocks GraphQL (except a pinned set of PR-review operations). Consequences:

- **Never trust `gh auth status`** — it validates over GraphQL and falsely reports valid tokens as invalid. Verify access with a repo-scoped REST call: `gh api repos/starwards/starwards -q .full_name`. (A successful `gh api user` does NOT guarantee repo access — user auth can pass while every repo call 403s until the Codex GitHub App is connected for the org.)
- **GraphQL-backed porcelain fails even with valid auth**: `gh pr list`, `gh issue list`, `gh pr view` and similar. Use `gh api` REST endpoints (e.g. `gh api 'repos/starwards/starwards/issues?labels=agent-ready&state=open'`) or the GitHub MCP tools for reads.
- REST-backed operations (`gh api ...`, and locally `git push`) work normally.

If the REST auth check fails, load GitHub MCP tools as the fallback (MCP auth has also failed in past sessions — up to 15 wasted retries — so don't retry it more than once either):

```
ToolSearch: select:mcp__github__list_issues,mcp__github__search_pull_requests,mcp__github__issue_write,mcp__github__issue_read,mcp__github__create_pull_request,mcp__github__pull_request_read
```

Do not retry MCP auth more than once.

**Check `node_modules` exists** at the repo root before running any test/build. The bootstrap script has repeatedly failed to install deps; if missing, run `npm ci` from the repo root (~30-60s) first. Symptom of skipping this: `npx jest` fails with a misleading "ts-jest module not found" or Babel/decorator error.

## Phase 1: Issue Selection

**Check the trigger context first.** If the run was fired by a GitHub webhook, the prompt carries a `<github-trigger-context>` block naming the exact issue (`Event: issues.labeled`, `Issue: #NNN`). That issue is your assignment — skip the scan below and just verify it is still available (no assignee, no `agent-in-progress` label, no open `agent/issue-NNN` PR, no claim comment newer than 24h). Scan only when there is no trigger issue or the named issue turns out to be taken.

Use **two REST calls** to find an unclaimed issue with no open PR (`gh issue list`/`gh pr list` are GraphQL-backed and fail behind the sandbox proxy — use `gh api`, or the MCP equivalents if REST auth failed):

```bash
# All agent-ready issues (the issues endpoint includes PRs — drop them) …
gh api 'repos/starwards/starwards/issues?labels=agent-ready&state=open&per_page=100' \
  -q '[.[] | select(.pull_request | not) | {number, title, created_at, assignee: .assignee.login, labels: [.labels[].name]}] | sort_by(.created_at)'
# … and all open agent/ PRs
gh api 'repos/starwards/starwards/pulls?state=open&per_page=100' \
  -q '[.[].head.ref | capture("agent/issue-(?<n>[0-9]+)"; "x").n | tonumber]'
```

Then pick the oldest unassigned issue without the `agent-in-progress` label whose number does not appear in the PR list. This replaces the per-issue PR search loop.

Claim immediately — comment plus label, via REST:
```bash
gh api repos/starwards/starwards/issues/NNN/comments -f body='Claimed by Codex
<session link>'
gh api repos/starwards/starwards/issues/NNN/labels -f 'labels[]=agent-in-progress'
```

## Phase 2: Understand (budget: ≤30% of session)

1. Read the issue body and comments.
2. Read `AGENTS.md` (you need the state access patterns, build commands, and architecture overview).
3. Read **only** the files mentioned in the issue or directly relevant to the fix. Do not explore the full codebase.
4. If the issue mentions a subsystem, read the subsystem's state class and its test file — that's usually enough context.

**Stop exploring when you can describe:** what to change, where, and how to test it.

**Definition of done: value in production.** An issue is done only when a player can trigger the new behavior in a real game — which means every issue implicitly includes ALL layers needed to deliver it: game logic, server/command surface, client wiring, UI controls, tests, and docs where conventions changed. Do NOT carve integral layers off into "follow-up" / "leftover" / "future work" notes — a mechanic without its UI, or a UI without its server wiring, delivers nothing and is not done. If you cannot complete the full slice, that is a Phase 6 outcome (unclaim + comment), not a partial PR presented as complete.

**Scope narrowing is sanctioned** in exactly two cases: the issue explicitly marks something out of scope, or the full ask exceeds the current architecture (e.g. requires per-faction state filtering that doesn't exist) — implement the explicitly in-scope subset and flag the narrowing prominently in the PR body. Do not silently narrow, do not attempt an unscoped architectural change, and never use narrowing to skip a layer of an in-scope feature.

## Phase 3: Develop (TDD required)

```
Invoke Skill: starwards-tdd
```

Follow the TDD cycle from that skill exactly:
1. Write a failing test that reproduces the issue or specifies the new behavior
2. Run `npm test` — confirm it fails (RED)
3. Write minimal implementation to pass
4. Run `npm test` — confirm it passes (GREEN)
5. Refactor if needed

**Time-based mechanics ripple into old tests.** Adding a timer/decay/promotion mechanic can break existing tests that simulate long durations (25-50s `runTicks`) under conditions that now trip the new timer. Budget for auditing those tests; fix by shortening simulated durations to just past the behavior under test, or relaxing assertions where the new mechanic legitimately applies.

Create your branch before the first commit:
```bash
git checkout -b agent/issue-NNN
```

## Phase 4: Verify (mandatory before commit)

```
Invoke Skill: starwards-verification
```

Run the full verification sequence:
```bash
npm run test:types && npm run test:format && npm run build && npm test
```

If any step fails, fix it before proceeding. Do not commit with known failures.

Run `npm run lint:fix` if formatting fails — then re-verify.

**Cross-module validation:** when a hypothesis depends on behavior across modules, rebuild with `npm run build` from the repo root — never a scoped `tsup-node`/`tsc` from inside a module. Turbo repacks/reinstalls the workspace package; a bare scoped build skips that, so changes don't propagate to the server module and you will chase phantom bugs.

**Verification-failure escape hatch:** if a single verification failure keeps consuming budget and appears unrelated to your feature logic, stop bisecting once you have (a) a reproducible characterization and (b) a clean workaround. Record the finding in the PR body (or an issue comment) for the maintainer instead of chasing full root cause. Exhaustive bisection of an environment or upstream-library bug is not your job in an unattended run.

**E2E in the sandbox:** e2e normally runs as-is. Check first — `npx playwright --version` against the revisions in `/opt/pw-browsers` — and only if the pinned browser revision is genuinely absent, use the sanctioned fallback: point Playwright at an installed `/opt/pw-browsers/chromium*` binary via a **temporary** `playwright.config.ts` edit, gather evidence, and revert the edit before committing — it must never land in the diff. If e2e is impossible, verify manually (boot server + browser build, screenshot) and say so in the PR body.

**If the gate cannot run at all** (npm blocked or node_modules unavailable): do not push silently. First state the exact blocker; then, only for trivial diffs (a removal, a rename) you have hand-reviewed for correctness and references, you may still open the PR — its body MUST open with "⚠️ Verification gate not run: <blocker>" so CI and the maintainer know to re-verify. For non-trivial diffs, follow Phase 6 (unassign + comment) instead.

**PR screenshots — SHA-pinned, then removed:** commit them to the branch under `.github/pr-screenshots/issue-NNN/` in a `docs:` commit, push, and note that commit's full SHA. Embed in the PR body as `![alt](https://github.com/starwards/starwards/blob/<full-commit-sha>/.github/pr-screenshots/issue-NNN/<name>.png?raw=true)` — pinned to the SHA, NOT the branch (branch URLs break when the branch is deleted after merge; SHA URLs keep resolving because PR head commits stay reachable). Then remove the binaries in a follow-up commit so the final PR diff stays clean. **After posting, re-read the rendered PR body and confirm every image resolves** — a broken embed is invisible from the markdown source. This needs only `git push` — it works even when `gh` auth is broken (the pr-media release-asset path requires `gh` and has never succeeded from the sandbox; do not use it, and do not burn retries on token workarounds). If you can't produce screenshots at all, describe the evidence (what was on screen, which values changed) in the PR body.

## Phase 5: Ship

```bash
git add <specific files>
git commit -m "fix: <description> (closes #NNN)

🤖 Automated by Codex"
git push -u origin agent/issue-NNN
gh pr create --repo starwards/starwards \
  --title "fix: <short description> (closes #NNN)" \
  --body "Closes #NNN

<what changed and why>

🤖 Automated by Codex"
```

If `gh pr create` fails behind the sandbox proxy (it touches GraphQL), create via REST instead:
```bash
gh api repos/starwards/starwards/pulls -f title='fix: <short description> (closes #NNN)' \
  -f head=agent/issue-NNN -f base=master -f body='Closes #NNN …'
```

## Phase 6: Failure Handling

If you cannot complete the issue (REST — the porcelain equivalents are GraphQL-backed):
```bash
gh api -X DELETE repos/starwards/starwards/issues/NNN/labels/agent-in-progress
gh api repos/starwards/starwards/issues/NNN/comments -f body='Attempted fix but blocked by: <specific reason>. Tried: <what you did>. Unclaiming.'
```

Do NOT open a PR with incomplete work. Do NOT leave the issue assigned to you.

## Red Flags — You Are Doing It Wrong

- You've made 5+ `search_pull_requests` calls → you skipped Phase 1's single-call pattern
- You've made 3+ `ToolSearch` calls → you skipped Phase 0 bootstrap
- You've made 2+ `authenticate` calls → fall back to `gh` CLI
- You're 50%+ through your session with no edits → you're over-exploring
- You wrote implementation code before a test → delete it, invoke `starwards-tdd`
- You're about to commit but haven't run verification → invoke `starwards-verification`
- You're writing "Let me..." or "I'll now..." → stop narrating, just execute

## Anti-Patterns From Prior Sessions

These patterns were observed in 17 autonomous sessions and waste significant context:

| Pattern | Waste | Fix |
|---------|-------|-----|
| Per-issue PR search loop | ~8 MCP calls/session | Single CLI call in Phase 1 |
| ToolSearch discovery loop | ~5 calls/session | Single `select:` call in Phase 0 |
| MCP auth retries | Up to 15 calls | Fall back to `gh` CLI after 1 failure |
| Full codebase exploration | 50-87% of session | Budget cap at 30% |
| Narration to nobody | ~1000 lines across sessions | Suppressed by Rule 1 |
| No skill invocation | 0/17 sessions used TDD | Made mandatory in Phase 3 |
