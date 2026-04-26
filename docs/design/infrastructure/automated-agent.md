# Automated Issue Worker

A scheduled Claude Code remote agent that autonomously picks and resolves GitHub issues.

## Setup

- **Trigger ID:** `trig_017a2DXXk7FgG8AXje2EF5Xr`
- **Schedule:** Every 2 hours (`0 */2 * * *`)
- **Model:** Claude Opus 4.6
- **Environment:** Full access (`env_011CUoKnFFySMGmadXtJzRDZ`)
- **Repo:** https://github.com/starwards/starwards
- **Manage:** https://claude.ai/code/scheduled/trig_017a2DXXk7FgG8AXje2EF5Xr

## How It Works

### Issue Selection

1. Queries `label:agent-ready` + `assignee:""` + `state:open`
2. Filters out issues that already have an open PR referencing them
3. Picks the oldest remaining issue (FIFO)
4. Assigns Amir (`amirad`) to claim it

### Development Flow

5. Reads the issue and `CLAUDE.md` for conventions
6. Creates branch `agent/issue-NNN`
7. Implements the fix
8. Runs `npm test`
9. Opens a PR with `Closes #NNN`

### Failure Handling

If the agent can't complete the issue:
- Unassigns from the issue
- Comments explaining what it tried and where it got stuck
- Does NOT open a PR with incomplete work

## The `agent-ready` Label

**Label:** `agent-ready` (green, `#0E8A16`)
**Purpose:** Human-curated gate for issues safe for autonomous work.

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

### Currently Labeled Issues (as of 2026-04-14)

**Bugs:**
- [#1847](https://github.com/starwards/starwards/issues/1847) — GM command makes ship un-pilotable
- [#866](https://github.com/starwards/starwards/issues/866) — Radar damage not reset on ship reset
- [#1002](https://github.com/starwards/starwards/issues/1002) — Cannon shells not shown on tactical radar
- [#1459](https://github.com/starwards/starwards/issues/1459) — Flaky test: helm assist moveToTarget
- [#1434](https://github.com/starwards/starwards/issues/1434) — Flaky test: rotationFromTargetTurnSpeed
- [#745](https://github.com/starwards/starwards/issues/745) — Target view when out of radar range
- [#853](https://github.com/starwards/starwards/issues/853) — Multi-ship move order broken

**Small features / tech debt:**
- [#1187](https://github.com/starwards/starwards/issues/1187) — Hull damage (2-state model)
- [#967](https://github.com/starwards/starwards/issues/967) — Name ship systems models
- [#748](https://github.com/starwards/starwards/issues/748) — Cleanup old rooms on game close
- [#1018](https://github.com/starwards/starwards/issues/1018) — Use logger instead of console
- [#843](https://github.com/starwards/starwards/issues/843) — Use RTuple2/Tuple2 types
- [#805](https://github.com/starwards/starwards/issues/805) — Clean up thruster velocity capacity

## Maintenance

- **Add issues:** Apply the `agent-ready` label in GitHub
- **Pause the agent:** Disable at https://claude.ai/code/scheduled/trig_017a2DXXk7FgG8AXje2EF5Xr
- **Review PRs:** The agent opens PRs under Amir's identity — review them like any contributor's work
- **Update the prompt:** Use `claude schedule` or the web UI to modify the trigger
