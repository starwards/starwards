# Autonomous Developer Agent Review

Analysis of 17 cloud-routine sessions (April 2026) where autonomous Claude Code agents picked up `agent-ready` GitHub issues and attempted to implement fixes.

## Methodology

Teleport transcripts were extracted from cloud sessions and analyzed for tool usage patterns, timing, failure signals, and workflow adherence across all sessions.

## Findings

### 1. Excessive exploration before first edit

Agents spend a disproportionate amount of their context on code reading and search before writing any code. Measured as percentage of session (by line) before the first `Edit` or `Write` tool call:

- Worst: 87% (session spent ~2700 lines exploring before touching code)
- Median: ~56%
- Best: 20%

The agent performs full codebase archaeology on every run, re-discovering the same architecture every time. This burns context window, increases latency, and reduces the budget left for actual implementation.

**Difficulty: medium.** Requires changes to issue labeling process or pre-computation of context.

**Possible mitigations:**
- Require `agent-ready` issues to include a "relevant files" section listing entry points
- Pre-populate issue context files (e.g., `.claude/issue-context/<issue>.md`) that the agent reads immediately
- Include a "start here" directive in the autonomous prompt pointing to CLAUDE.md's architecture section rather than letting the agent wander

### 2. Project skills almost never invoked

The project defines 8+ specialized skills (`starwards-tdd`, `starwards-workflow`, `starwards-verification`, `starwards-debugging`, `starwards-monorepo`, `starwards-colyseus`, `starwards-station-ui`, `starwards-ci-debugging`). CLAUDE.md marks skill usage as **MANDATORY**.

Across 17 autonomous sessions, only **2 skill invocations** occurred (one `starwards-ci-debugging`, one `github-api`). Zero invocations of `starwards-tdd`, `starwards-workflow`, `starwards-verification`, or `brainstorming`.

The `using-superpowers` bootstrapping skill — designed to ensure other skills are discovered — never fires in autonomous mode.

**Difficulty: hard.** Cloud routines may not load the superpowers plugin or skill registry the same way interactive sessions do. The agent's system prompt ("You are an autonomous developer...") may override or precede the skill-discovery mechanism.

**Possible mitigations:**
- Inline critical skill content (especially TDD and verification) directly into the autonomous prompt
- Add explicit `Skill` tool calls to the prompt's instruction sequence (e.g., "Step 0: invoke `starwards-workflow` to load project conventions")
- Investigate whether cloud routines have access to the skill registry at all

### 3. Wasteful issue-selection protocol

The current prompt instructs the agent to:
1. List all `agent-ready` issues
2. For each candidate (oldest first), search for existing PRs one at a time
3. Skip issues with open PRs, take the first available

This results in **~8 `search_pull_requests` calls per session** (149 total across 17 sessions), all before any actual work begins.

**Difficulty: easy.**

**Possible mitigations:**
- Replace the per-issue PR check with a single `gh` CLI call that returns all open agent PRs, then filter locally
- Pre-assign issues to the routine before it starts (eliminates selection entirely)
- Use GitHub Actions to maintain a queue — the routine receives a specific issue number, not a search task

### 4. ToolSearch discovery loop

Agents repeatedly search for GitHub MCP tool schemas at startup because deferred tools aren't loaded. One session made 10 ToolSearch calls and 15 authentication attempts before doing any work.

Typical pattern: agent calls ToolSearch with a broad query, gets partial results, tries again with different keywords, eventually finds the right tool names.

**Difficulty: easy.**

**Possible mitigations:**
- Include exact `select:` ToolSearch calls in the prompt (e.g., `select:mcp__github__list_issues,mcp__github__search_pull_requests,mcp__github__issue_write,mcp__github__create_pull_request`)
- Pre-load required tool schemas in the routine configuration if the platform supports it

### 5. GitHub authentication failures in headless mode

Multiple sessions show `authenticate`/`complete_authentication` MCP calls (up to 15 in one session). This suggests the GitHub MCP server's auth isn't reliably pre-configured for cloud routines.

**Difficulty: medium.** Depends on cloud routine infrastructure.

**Possible mitigations:**
- Ensure `GITHUB_TOKEN` is available in the routine's environment
- If the MCP server uses OAuth, it won't work headless — switch to PAT-based auth
- Fall back to `gh` CLI (which the agents already use successfully) instead of the MCP GitHub tools for issue/PR operations

### 6. No TDD discipline without skills

Without `starwards-tdd` loading, agents default to implementation-first workflow: write code, then run tests, then fix failures. This leads to more build/test iteration cycles (73 FAIL/error lines observed across sessions).

**Difficulty: medium.** Depends on solving finding #2 (skill loading).

**Possible mitigations:**
- Even without the skill, the autonomous prompt could include a "write a failing test first" instruction
- Add a verification step requirement: "Run `npm test` before and after your changes"

### 7. Excessive narration in autonomous mode

~1,079 lines across sessions are narration ("I'll start by...", "Let me now...", "I should..."). No human reads these in autonomous mode — they waste tokens and context.

**Difficulty: easy.**

**Possible mitigations:**
- Add to autonomous prompt: "You are running unattended. Do not narrate your actions. Execute directly without preamble."

### 8. Duplicate session execution

Two cloud session IDs (`017ZYP9d` and `01HvXDkT`) produced byte-identical content. Likely a session extraction artifact rather than a scheduling bug, but worth verifying that the routine scheduler doesn't double-fire.

**Difficulty: low (investigation only).**

## Summary

| # | Finding | Difficulty | Impact |
|---|---------|-----------|--------|
| 1 | Excessive exploration before editing | Medium | High — wastes majority of context |
| 2 | Skills never invoked | Hard | High — loses TDD, verification, patterns |
| 3 | Wasteful issue selection | Easy | Medium — burns tool calls |
| 4 | ToolSearch discovery loop | Easy | Low-Medium — startup overhead |
| 5 | GitHub auth in headless mode | Medium | Medium — causes retries |
| 6 | No TDD without skills | Medium | Medium — more fix cycles |
| 7 | Excessive narration | Easy | Low — wasted tokens |
| 8 | Duplicate execution | Low | Low — likely extraction artifact |

## Mitigation: `starwards-autonomous` skill

A new skill (`.claude/skills/starwards-autonomous/SKILL.md`) was created to address findings 1-7. It encodes:
- Single-call issue selection (finding 3)
- ToolSearch bootstrap in one `select:` call (finding 4)
- MCP auth fallback to `gh` CLI (finding 5)
- 30% exploration budget cap (finding 1)
- Mandatory `starwards-tdd` and `starwards-verification` invocation (findings 2, 6)
- Narration suppression (finding 7)

**Critical dependency:** The autonomous routine's prompt must explicitly invoke this skill. The baseline shows agents don't self-discover skills (finding 2), so the prompt must include:

```
Your first action: invoke the `starwards-autonomous` skill and follow it exactly.
```

Without this line in the routine prompt, the skill will not be loaded.

## Next Steps

1. **Update the routine prompt** to explicitly invoke `starwards-autonomous` (required for any improvement)
2. Verify GitHub token is available in routine environment (finding 5)
3. Add relevant-files hints to `agent-ready` issues (finding 1)
4. Run a few sessions with the new skill and compare metrics against this baseline
