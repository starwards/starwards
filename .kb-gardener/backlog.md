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

## open

- [broken-link] docs/list-of-approaches.md — three links to `../modules/browser/src/radar/spatial-index.ts`; the file is not at that path. Find where the spatial index lives now and repoint, or drop the claim if the technique was removed. Reported by the repo's own `scripts/lint-docs.mjs`.

## won't do

- [missing-doc] docs/runbooks.md — the scaffold flagged "runbooks" uncovered, but every operational procedure already has an owner: session/ports/dev loop in `docs/DEVELOPMENT.md`, crash and reconnect in `docs/design/infrastructure/crash-recovery.md`, snapshot regeneration in `docs/testing/README.md`. A runbook hub would be a second place to state them, which is drift bait. Preview-environment operations are covered by `docs/DEPLOYMENT.md` instead. (kb-gardener)
- [source-discoverability] eslint.config.mjs — bare `PATTERNS.md` reference resolves against the source dir, not `docs/`; the file exists at `docs/PATTERNS.md`. False positive. (kb-gardener)
- [source-discoverability] scripts/lint-docs.mjs — same: bare `AUTHORING.md` references resolve to `docs/AUTHORING.md`. False positive. (kb-gardener)
- [source-discoverability] modules/core/test/property-lock.spec.ts — `governance/invariants.md` lives in the sibling `starwards-design` repo, not this KB. Cross-repo by design. (kb-gardener)
- [source-discoverability] modules/e2e/test/gm-screen.spec.ts — same cross-repo `governance/invariants.md` reference. (kb-gardener)
