# CLAUDE.md

This folder is the **product / PM knowledge base** for Starwards — what to build and why.
The codebase lives in this repo (root is two levels up at `../../`). Technical implementation docs live alongside this folder under `docs/` (e.g., `../PHYSICS.md`, `../SUBSYSTEMS.md`, `../ARCHITECTURE.md`, `../MS3/`).

## Document Structure

Three discovery layers:

1. **Orientation:** `README.md` → `vision.md` → `roadmap.md` → `stakeholders.md`
2. **Dashboards:** `status.md` (feature table), `ee-gap-analysis.md`, `event-readiness.md`, `issue-review.md`
3. **Detail:** `stations/`, `mechanics/`, `infrastructure/`, `decisions/`

## Conventions

- GitHub issues are referenced as `[#NNN](https://github.com/starwards/starwards/issues/NNN)`
- Status values: Done, Partial, Designed, Planned, Deferred, Skip
- Decision records follow the template in `decisions/TEMPLATE.md`
- `status.md` is the most frequently updated file — update it when feature status changes
- Keep documents factual — content is derived from GitHub issues, dev blog, and starwards repo docs, not invented

## Key Context

- Starwards replaces the legacy EmptyEpsilon fork for Helios LARP events
- 2-person team (Amir + Daniel), day jobs, AI-assisted development workflow
- Current strategy: ship a 4-station bridge (Pilot, Weapons, ECR, Signals) first, expand later (see `decisions/004-ship-early-expand-later.md`)
- GitHub issues: https://github.com/starwards/starwards/issues
- Dev blog: https://starwards.github.io
