# Decision: Adopt AI-assisted development as core workflow

**Date:** 2025-10
**Status:** Accepted

## Context

Both core developers have day jobs. Life circumstances changed significantly (immigration, war impact). The project needed a sustainable development model with limited human hours. AI coding tools had matured to the point of being genuinely productive for well-documented codebases.

## Decision

Make AI-assisted development the primary workflow: describe what we want, review what gets produced, iterate quickly. Invest heavily in documentation (architecture guides, subsystem specs, development patterns) to make the codebase AI-navigable.

## Consequences

- **Enabled 131 commits in Oct-Dec 2025** despite reduced human availability.
- **Documentation became a first-class deliverable** — extensive docs added for architecture, physics, subsystems, testing patterns.
- **Playwright E2E testing added** — automated verification reduces human review burden.
- **Lower barrier for contribution** — good docs help both AI tools and human contributors.
- **Risk:** AI-generated code may miss design intent or introduce subtle issues. Mitigation: strong test coverage and human review of all changes.
