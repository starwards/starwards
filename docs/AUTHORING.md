---
audience: both
depth: light
related:
  - design/CLAUDE.md
  - DEPENDENCIES.md
last_verified: 2026-06-13
---

# Documentation Authoring Guide

**Read this before writing or editing any file under `docs/`.** It exists so the
knowledge base stays accurate as the code changes — the failure mode that most often
misleads AI agents is a doc that *looks* authoritative but no longer matches the code.

These rules extend the conventions in [`design/CLAUDE.md`](design/CLAUDE.md) (status
vocabulary, issue-reference format, "keep it factual"). They apply to every doc; the
[`docs-kb-staleness-sweep`](../.claude/workflows/docs-kb-staleness-sweep.js) workflow
enforces them on each audit.

## The rules

### Rule 1 — No line numbers

Never cite a source location as `file.ts:NNN`. Line numbers rot on the next refactor and
silently send readers to the wrong place.

Cite a **greppable symbol** plus the file path instead — a class, function, decorator, or
constant name that survives moves:

- ✅ `` `@gameField` `` in `modules/core/src/game-field.ts`
- ✅ `SystemState.effectiveness` in `modules/core/src/ship/system.ts`
- ❌ `modules/core/src/game-field.ts:261`

For markdown links, link the **file**, never append `:NNN` (it is not a valid anchor, so
the link is dead as well as stale):

- ✅ `` [`@gameField`](../modules/core/src/game-field.ts) ``
- ❌ `` [`@gameField`](../modules/core/src/game-field.ts:261) ``

### Rule 2 — One source of truth for versions

Dependency versions live in `package.json`. [`DEPENDENCIES.md`](DEPENDENCIES.md) is the
**only** doc that restates them (with rationale and upgrade notes). Every other doc refers
to the dependency by name and links there — no version number:

- ✅ "Colyseus (see [DEPENDENCIES.md](DEPENDENCIES.md))"
- ❌ "Colyseus v0.16" / "pixi.js ^8.14.0" sprinkled across LLM_CONTEXT, ARCHITECTURE, specs…

A bare major-version label is acceptable only where it is the *subject* of the sentence and
cannot be expressed otherwise; prefer the pointer.

### Rule 3 — Mark mirrored code

A code fence copied from a source file gets a first-line comment naming the source (no line
number) so a reader can re-verify it:

```typescript
// mirrors: modules/core/src/ship/system.ts
public get effectiveness() {
    return this.broken ? 0 : this.power * this.hacked;
}
```

Illustrative/pseudocode snippets need no marker. Prefer **linking** to copying a long body —
the shorter the mirrored region, the less it can drift.

### Rule 4 — Status comes from GitHub, not hardcoded counts

Don't write "42 of 63 issues closed" or "~67% complete" — it is wrong the next day. Link the
milestone or issue query and use the shared status vocabulary from
[`design/CLAUDE.md`](design/CLAUDE.md): **Done · Partial · Designed · Planned · Deferred · Skip**.

Reference issues as `[#NNN](https://github.com/starwards/starwards/issues/NNN)`.

### Rule 5 — Keep every claim verifiable

Every factual claim must be checkable against the current code with Read/Grep. Use
**repo-relative paths** only — never machine-specific absolutes like `/data/Workspace/...` or
`C:\Workspace\...`. Design intent, dated decisions, and historical notes are exempt (they
describe the past on purpose) — but if a doc presents a statement as *current* code state, it
must hold today.

### Rule 6 — new files are kebab-case

Name new docs `lowercase-with-hyphens.md`, per
[`standards/standards-naming.md`](standards/standards-naming.md) ("Make file and directory names
lowercase… Use hyphens, not underscores"). Never use spaces — they break links on some
platforms and make globbing awkward.

Much of the KB predates this rule and uses `SCREAMING_SNAKE.md`. **Do not mass-rename** —
inbound links from code comments, skills, and CI config would break for no functional gain.
Legacy names are tolerated; only new files must conform.

### Rule 7 — one concern per note

A note covers one subject a reader would go looking for by name. If its `##` sections would sit
happily in separate files, split it and link the parts from the owning hub. A doc that mixes four
topics can only carry one `last_verified` date, one `depth`, and one `source_of_truth` list — so
drift in one section hides behind the freshness of the others.

Two exceptions:

- **Reference manuals** that apply one template across many sub-items (`specs/*_SPEC.md`,
  `standards/*`) are a single concern however long they get.
- **Anchor targets cited from source comments** — [`SUBSYSTEMS.md`](SUBSYSTEMS.md) (`@see
  docs/SUBSYSTEMS.md#...` across `modules/core/src/ship/`) and [`json-ptr.md`](json-ptr.md)
  (ESLint config, core source, tests) — are frozen. Extend them; don't restructure them.

## Frontmatter

Entry-point and deep, code-mapped docs carry YAML frontmatter so agents and the staleness
sweep can route deterministically. Add it to: the agent entry points, `ARCHITECTURE.md`,
`API_REFERENCE.md`, `SUBSYSTEMS.md`, `PATTERNS.md`, `TECHNICAL_REFERENCE.md`, `PHYSICS.md`,
`DEPENDENCIES.md`, `specs/*.md`, and `testing/UTILITIES.md`.

Do **not** add frontmatter to design/PM docs, playtest notes, decision records, or the vendor
dumps under `reference/` — they are "light" and over-tagging just creates more to keep current.

```yaml
---
audience: agent        # agent | human | both
depth: deep            # deep | light  — must match the staleness-sweep's classification
source_of_truth:       # optional: repo-relative code/config paths this doc tracks (no line numbers)
  - modules/core/src/ship/system.ts
related:               # optional: repo-relative doc links
  - DEPENDENCIES.md
last_verified: 2026-06-13   # ISO date the claims were last checked against code
---
```

Field values:

| Field | Allowed values |
|-------|----------------|
| `audience` | `agent` · `human` · `both` |
| `depth` | `deep` · `light` (exactly — the sweep consumes this enum) |
| `source_of_truth` | list of repo-relative paths, no line numbers (optional) |
| `related` | list of repo-relative doc paths (optional) |
| `last_verified` | ISO date `YYYY-MM-DD` |

GitHub hides a leading `---` block in rendered Markdown, so frontmatter is invisible to human
readers.

## Self-check before you commit

From the repo root:

```bash
# Rule 1 — no line numbers in the file(s) you touched
grep -nE '\.tsx?:[0-9]+' docs/THE_FILE.md            # expect no output

# Rule 2 — no stray version numbers outside DEPENDENCIES.md
grep -nE 'v0\.[0-9]|pixi.*v[0-9]|React [0-9]' docs/THE_FILE.md

# Rule 5 — no machine-specific absolute paths
grep -nE '/data/Workspace|[A-Z]:\\\\Workspace' docs/THE_FILE.md

# Rule 7 — a long list of top-level sections is a smell, not a verdict
grep -c '^## ' docs/THE_FILE.md
```
