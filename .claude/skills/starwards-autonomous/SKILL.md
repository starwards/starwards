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

**`gh` CLI is the primary GitHub interface.** Use it for all GitHub operations (issues, PRs, comments) — it authenticates reliably in headless runs, where GitHub MCP auth has repeatedly failed (up to 15 wasted retries in past sessions). Verify it once with `gh auth status`; if it's not authenticated, only then load GitHub MCP tools as the fallback:

```
ToolSearch: select:mcp__github__list_issues,mcp__github__search_pull_requests,mcp__github__issue_write,mcp__github__issue_read,mcp__github__create_pull_request,mcp__github__pull_request_read
```

Do not retry MCP auth more than once.

## Phase 1: Issue Selection

Use a **single CLI call** to find an unclaimed issue with no open PR:

```bash
# Get all agent-ready issues and all open agent/ PRs in two parallel calls
gh issue list --repo starwards/starwards --label agent-ready --assignee "" --state open --json number,title,createdAt --jq 'sort_by(.createdAt)' &
gh pr list --repo starwards/starwards --search "head:agent/" --state open --json headRefName --jq '[.[].headRefName | capture("agent/issue-(?<n>[0-9]+)").n | tonumber]' &
wait
```

Then pick the oldest issue whose number does not appear in the PR list. This replaces the per-issue PR search loop.

Claim immediately:
```bash
gh issue edit NNN --repo starwards/starwards --add-assignee amirad
```

## Phase 2: Understand (budget: ≤30% of session)

1. Read the issue body and comments.
2. Read `CLAUDE.md` (you need the state access patterns, build commands, and architecture overview).
3. Read **only** the files mentioned in the issue or directly relevant to the fix. Do not explore the full codebase.
4. If the issue mentions a subsystem, read the subsystem's state class and its test file — that's usually enough context.

**Stop exploring when you can describe:** what to change, where, and how to test it.

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

## Phase 5: Ship

```bash
git add <specific files>
git commit -m "fix: <description> (closes #NNN)

🤖 Automated by Claude Code"
git push -u origin agent/issue-NNN
gh pr create --repo starwards/starwards \
  --title "fix: <short description> (closes #NNN)" \
  --body "Closes #NNN

<what changed and why>

🤖 Automated by Claude Code"
```

## Phase 6: Failure Handling

If you cannot complete the issue:
```bash
gh issue edit NNN --repo starwards/starwards --remove-assignee amirad
gh issue comment NNN --repo starwards/starwards --body "Attempted fix but blocked by: <specific reason>. Tried: <what you did>. Unassigning."
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
