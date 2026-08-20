# kb-gardener backlog

<!--
FORMAT CONTRACT — both halves of kb-gardener and backlog-merge.mjs depend on this.

Item line:  - [<type>] <target> — <description>
  <type>        one of the types in references/work-item-types.md, in square brackets
  <target>      path relative to this file's directory (the backlog root),
                posix separators. A trailing "/" marks a directory target.
  " — "         em dash surrounded by single spaces; separates target from description
  <description> free prose, single line

won't-do lines carry a trailing attribution: "(human)" or "(kb-gardener)".

Only two sections, both required, in this order: "## open", "## won't do".
There is no "## done" section — completed items are deleted outright.

Lines that are not item lines (blank lines, this comment, the header) are preserved
verbatim by backlog-merge.mjs.
-->

Survey conventions for this repo:

- Run `doc-graph.mjs` with `--root-doc docs/README.md`. `docs/README.md` is the hub;
  there is deliberately no `docs/index.md`.
- Run every script from the repo root, then **filter findings to paths under `docs/`**.
  `--scope` limits which *code* is analysed, not which docs are scanned, so an unfiltered
  run reports on `.claude/skills/`, `.agents/skills/`, `modules/*/README.md` and root
  governance files — none of which belong to this KB.
- Pass the same `--as-of` to every script in one survey.

Rules that are noise against this KB and are discarded wholesale at triage, not merged
(survey of 2026-08-17 produced 848 raw `docs/`-scoped findings and 9 real items):

- `missing-updated` / `unowned` (141 each) — this KB uses `last_verified`, not `updated`,
  and records no owners. Every doc fires; nothing is learned. See `docs/AUTHORING.md`.
- `duplicate-anchor` (161) — repeated `## Overview` / `## Setup` headings in long docs.
  Nothing links to them, so no reader is harmed.
- `missing-section` (39) — asserts every README needs installation/usage/license sections.
  Folder READMEs inside a KB are signposts, not project READMEs.
- `thin-doc` (27) — fires on ADRs and folder signposts, which are short on purpose.
- `code-churn` (57) — associates a doc with a whole subtree, so `AUTHORING.md` scores 3408
  changes. Too coarse to act on; `stale-doc` covers the same ground with a real signal.
- `renamed-reference` (4) — emits "references X, which was renamed to X". Tool defect.
- `missing-reference` (260) — 188 resolve to a real file under a different directory, and
  most of the rest name EmptyEpsilon C++ sources, glob patterns, npm package names, or
  paths in the sibling `starwards-design` repo. The genuine ones were triaged into the
  items above by hand; re-triage rather than bulk-merging this rule.

## open


## won't do

- [stale-doc] docs/standards/standards-naming.md — the body is a verbatim quote of Google's filename style guide. It tracks an upstream document, not this codebase, so elapsed time since the last edit carries no drift signal. Its `Live` tier in `docs/README.md` is what is wrong, and re-tiering the whole `standards/` row is not this item. (kb-gardener)

- [stale-doc] docs/integration/extending-ship-systems.md — the `shield.ts` / `shield-manager.ts` / `widgets/shield.ts` paths are inside the "Add a ship system" walkthrough, which invents a shield system as its worked example. Nothing claims those files exist. (kb-gardener)
- [broken-reference] docs/design/ui-specs/VISUAL_TOKEN_INTEGRATION.md — `modules/browser/src/fonts.ts` is prefixed **Proposed:**; a proposal naming a file it would create is not a dead reference. (kb-gardener)
- [broken-reference] docs/testing/TESTING_STRATEGY.md — `modules/core/test/test-factories.ts` is introduced as "new file:"; same as above. (kb-gardener)
- [broken-reference] docs/superpowers/specs/2026-08-08-recording-replay-ux-design.md — the spec shipped: `game-transport.ts` became `modules/browser/src/widgets/game-controls.ts`, exactly as written. The old name appears only as the subject of the rename in a dated spec. (kb-gardener)
- [broken-reference] docs/bridge-playtest/decisions.md — both `mechanics/` links are full `github.com/starwards/starwards-design` URLs, not repo-relative paths. Cross-repo by design. (kb-gardener)
- [broken-reference] docs/design/infrastructure/automated-agent.md — the `CONTRACT.md` link is a full URL into `starwards-design/governance/`. Cross-repo by design. (kb-gardener)

- [missing-doc] docs/runbooks.md — the scaffold flagged "runbooks" uncovered, but every operational procedure already has an owner: session/ports/dev loop in `docs/DEVELOPMENT.md`, crash and reconnect in `docs/design/infrastructure/crash-recovery.md`, snapshot regeneration in `docs/testing/README.md`. A runbook hub would be a second place to state them, which is drift bait. Preview-environment operations are covered by `docs/DEPLOYMENT.md` instead. (kb-gardener)
- [stale-doc] docs/MS3/ — the whole milestone-3 corpus is marked Historical in `docs/README.md`; it describes a past design state on purpose, so its age is not drift. (kb-gardener)
- [stale-doc] docs/reference/ — marked Reference in `docs/README.md`: external and vendor material, verified against upstream rather than kept fresh here. Age is expected. (kb-gardener)
- [broken-reference] docs/AUTHORING.md — the "dead link" to `../modules/core/src/game-field.ts:261` carries a line-number suffix; the file exists. Tool artifact. (kb-gardener)
- [broken-reference] docs/bridge-playtest/ee-reference/bridge-game-design-2-Mini-Games-and-Per-Station-Interactions.md — dead anchor `#relay--operations-station`, plus every "missing" `.cpp`/`.h` reference in this folder. These cite the EmptyEpsilon source tree, which is a different repo. (kb-gardener)
- [duplication] docs/design/CLAUDE.md — shares the title "CLAUDE.md" with the root `CLAUDE.md`. Both are folder-scoped agent guides and the name is the convention Claude Code requires; the collision is deliberate. (kb-gardener)
- [source-discoverability] eslint.config.mjs — bare `PATTERNS.md` reference resolves against the source dir, not `docs/`; the file exists at `docs/PATTERNS.md`. False positive. (kb-gardener)
- [source-discoverability] scripts/lint-docs.mjs — same: bare `AUTHORING.md` references resolve to `docs/AUTHORING.md`. False positive. (kb-gardener)
- [source-discoverability] modules/core/test/property-lock.spec.ts — `governance/invariants.md` lives in the sibling `starwards-design` repo, not this KB. Cross-repo by design. (kb-gardener)
- [source-discoverability] modules/e2e/test/gm-screen.spec.ts — same cross-repo `governance/invariants.md` reference. (kb-gardener)
