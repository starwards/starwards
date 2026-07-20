# CLAUDE.md

This folder is **code-grounded design reference** for Starwards. Strategic planning (roadmap, feature status, backlog, milestones) lives in the [starwards-design](https://github.com/starwards/starwards-design) KB (`product/`); GitHub issues are dispatch tickets only (see starwards-design `governance/decisions/0003-github-as-dispatch-only.md`).
The codebase lives in this repo (root is two levels up at `../../`). Technical implementation docs live alongside this folder under `docs/` (e.g., `../PHYSICS.md`, `../SUBSYSTEMS.md`, `../ARCHITECTURE.md`, `../MS3/`).

## Document Structure

1. **Orientation:** `README.md` → `vision.md` → `stakeholders.md` (roadmap/status: see starwards-design `product/`)
2. **Reference:** `ee-gap-analysis.md`, `stations/`, `mechanics/`, `infrastructure/`, `decisions/`

## Conventions

- GitHub issues are referenced as `[#NNN](https://github.com/starwards/starwards/issues/NNN)`
- Decision records follow the template in `decisions/TEMPLATE.md`
- Feature status changes go to starwards-design `product/status.md` (a G1 surface, changed by PR there)
- Keep documents factual — content is derived from GitHub issues, dev blog, and starwards repo docs, not invented

## Key Context

- Starwards replaces the legacy EmptyEpsilon fork for Helios LARP events
- 2-person team (Amir + Daniel), day jobs, AI-assisted development workflow
- Current strategy: ship a 4-station bridge (Pilot, Weapons, ECR, Signals) first, expand later (see `decisions/004-ship-early-expand-later.md`)
- GitHub issues: https://github.com/starwards/starwards/issues
- Dev blog: https://starwards.github.io
