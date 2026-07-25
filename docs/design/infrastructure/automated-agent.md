# Automated Issue Worker

A scheduled Claude Code remote agent that autonomously picks and resolves GitHub issues.

## Where the process is defined

This page covers only what is specific to this repo: the trigger, and what makes an issue
safe for an agent. The pipeline itself is defined elsewhere — don't restate it here:

- **What the agent does, step by step** — the [`starwards-autonomous`](../../../.claude/skills/starwards-autonomous/SKILL.md) skill. This is what actually executes in the sandbox and is authoritative for claim mechanics, verification gates, and screenshot handling.
- **How the wider pipeline is governed** (stages, gates, roles) — [starwards-design `pipeline/`](https://github.com/starwards/starwards-design/blob/main/pipeline/README.md) and its [`CONTRACT.md`](https://github.com/starwards/starwards-design/blob/main/governance/CONTRACT.md).

## Trigger

- **Trigger ID:** `trig_017a2DXXk7FgG8AXje2EF5Xr`
- **Schedule:** Every 2 hours (`0 */2 * * *`)
- **Repo:** https://github.com/starwards/starwards
- **Manage:** https://claude.ai/code/scheduled/trig_017a2DXXk7FgG8AXje2EF5Xr

The prompt the trigger runs is held in the trigger configuration, not in this repo — edit it
there so there is exactly one copy.

## The `agent-ready` Label

**Label:** `agent-ready` (green, `#0E8A16`)
**Purpose:** Human-curated gate for issues safe for autonomous work.

Current queue: [open `agent-ready` issues](https://github.com/starwards/starwards/issues?q=is%3Aissue+is%3Aopen+label%3Aagent-ready).

### Criteria for Labeling

Issues should be `agent-ready` when they are:

- Well-scoped with clear done conditions
- Self-contained (no unresolved dependencies)
- Low-risk (not architectural, not touching GM tools)
- Describable enough that the agent can determine what files to change

### Issues NOT suitable for `agent-ready`

- Architectural decisions (docking, warp topology)
- Features requiring design judgment
- Cross-station changes
- Issues with stale descriptions that don't match current code

## Maintenance

- **Add issues:** Apply the `agent-ready` label in GitHub
- **Pause the agent:** Disable at https://claude.ai/code/scheduled/trig_017a2DXXk7FgG8AXje2EF5Xr
- **Review PRs:** The agent opens PRs under Amir's identity — review them like any contributor's work
- **Update the prompt:** Use `claude schedule` or the web UI to modify the trigger
