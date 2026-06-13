export const meta = {
  name: 'docs-kb-staleness-sweep',
  description: 'Audit the docs/ knowledge base for claims that contradict the current code, verify each finding adversarially, and (optionally) apply surgical corrections',
  whenToUse: 'Run to refresh the documentation KB after code changes — finds doc claims (paths, APIs, versions, commands, formulas, status) that no longer match the codebase. Pass args to scope it or to preview without editing.',
  phases: [
    { title: 'Discover', detail: 'enumerate docs/ and group files into audit units', model: 'sonnet' },
    { title: 'Audit', detail: 'verify each doc group\'s claims against the code', model: 'sonnet' },
    { title: 'Verify', detail: 'adversarially confirm each staleness finding', model: 'opus' },
    { title: 'Fix', detail: 'apply confirmed corrections, then read back to measure what landed (skipped in dry-run)', model: 'opus' },
  ],
}

// ---- args (all optional) ----
//   root:    docs root to sweep (default 'docs')
//   apply:   set false for a dry-run that reports findings without editing (default true)
//   today:   ISO date string, helps agents judge "dated record vs current-state claim" (default: omitted)
//   exclude: array of path substrings to skip (defaults below cover historical dumps)
const ROOT = (args && args.root) || 'docs'
const APPLY = !(args && args.apply === false)
const TODAY = (args && args.today) || ''
const EXCLUDE = (args && Array.isArray(args.exclude)) ? args.exclude
  : ['docs/archive/', 'docs/reference/pixijs/', '/ee-reference/']

const DISCOVERY = {
  type: 'object',
  required: ['units', 'discoveredFileCount'],
  properties: {
    discoveredFileCount: { type: 'integer', description: 'total count of non-excluded Markdown files you enumerated under the root; must equal the sum of files across all units (a coverage check)' },
    units: {
      type: 'array',
      description: 'Audit units, each a small group of related docs',
      items: {
        type: 'object',
        required: ['key', 'depth', 'files'],
        properties: {
          key: { type: 'string', description: 'short kebab-case label for the group' },
          depth: { type: 'string', enum: ['deep', 'light'], description: 'deep = technical doc whose claims map to code; light = design/historical/planning doc' },
          files: { type: 'array', items: { type: 'string' }, description: 'repo-relative doc paths in this unit (1-5 files)' },
        },
      },
    },
  },
}

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'quote', 'claim', 'evidence', 'correction', 'confidence'],
        properties: {
          file: { type: 'string', description: 'doc path relative to repo root' },
          quote: { type: 'string', description: 'short verbatim excerpt from the doc containing the stale claim' },
          claim: { type: 'string', description: 'what the doc asserts' },
          evidence: { type: 'string', description: 'specific code file/lines or command output proving it is stale today' },
          correction: { type: 'string', description: 'proposed corrected text' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['isStale', 'reasoning'],
  properties: {
    isStale: { type: 'boolean' },
    reasoning: { type: 'string' },
    revisedCorrection: { type: 'string', description: 'improved correction text if the original proposal was off' },
  },
}

const FIXED = {
  type: 'object',
  required: ['edits'],
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'summary'],
        properties: { file: { type: 'string' }, summary: { type: 'string' } },
      },
    },
    skipped: { type: 'array', items: { type: 'string' } },
  },
}

const APPLIED = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'applied'],
        properties: {
          file: { type: 'string' },
          applied: { type: 'boolean', description: 'true only if the correction is now present in the file AND the stale text is gone' },
          note: { type: 'string', description: 'one line; required when applied=false' },
        },
      },
    },
  },
}

const DATE_LINE = TODAY ? ` Today is ${TODAY}.` : ''

const COMMON = `Repo: Starwards, a TypeScript npm-workspaces monorepo (modules/core, modules/browser, modules/server, modules/node-red, modules/e2e). You are running inside the repository (current working directory is the repo root).${DATE_LINE}
Ground truth is the CODE as it exists right now: source files, package.json scripts, config files, directory layout. Use Read/Grep/Glob to check; you may run read-only git commands (e.g. git log) and inspect package.json, but run nothing with side effects.
IMPORTANT distinctions:
- A claim is STALE only if it asserts something about the current codebase that is factually wrong TODAY (wrong path, removed/renamed API, wrong command, wrong version, wrong behavior, "not implemented yet" for something now implemented, "current status" sections that no longer hold).
- Design intent, future plans, opinions, historical/dated records (meeting notes, dated decisions, retrospectives) are NOT stale even if reality diverged — unless the doc presents the statement as the current state of the code.
- Do not flag wording, style, or things you merely couldn't find — only flag when you located positive evidence of the contradiction.
For each stale claim return: file, a SHORT verbatim quote from the doc (exact substring, <200 chars), the claim, evidence (specific code path/lines or package.json field proving staleness), a proposed correction, and confidence. Do not edit any files. If nothing is stale, return an empty findings list.`

function discoveryPrompt() {
  return `${COMMON}

DISCOVERY. Enumerate every Markdown documentation file under \`${ROOT}/\` (recursively; use Glob "${ROOT}/**/*.md"). Then group them into AUDIT UNITS for downstream fact-checking.

Rules:
- Exclude any file whose path contains one of these substrings: ${JSON.stringify(EXCLUDE)} (historical archives and verbatim external dumps — not worth auditing).
- Group 1-5 RELATED files per unit, generally by directory or topic. A large/central technical doc (e.g. an architecture or API reference) can be its own unit.
- Classify each unit's depth:
  - "deep" — technical docs whose claims map directly to code: architecture, API/technical references, code-pattern guides, subsystem/physics/state specs, dependency lists, testing utilities, implementation notes, UI/widget specs.
  - "light" — design intent, vision, roadmaps, decision records, playtest notes, planning/Q&A, and other mostly-prose docs where most content is intentionally not code-derived.
  - If a file begins with YAML frontmatter containing \`depth: deep\` or \`depth: light\`, trust that value over your own heuristic.
- Return repo-relative paths. Do not omit any non-excluded .md file; every one must land in exactly one unit.
- Also return discoveredFileCount: the total number of non-excluded .md files you enumerated. It must equal the sum of files across all units (used as a coverage check downstream).`
}

function auditPrompt(unit) {
  const fileList = unit.files.join('\n- ')
  if (unit.depth === 'deep') {
    return `${COMMON}

DEEP AUDIT. Read each of these documentation files in full:
- ${fileList}

Verify every checkable factual claim against the code: file paths, npm scripts/commands, class/function/decorator names, API endpoints, room names, state fields, formulas, config values, version numbers, port numbers, directory structures, "status"/"implemented" claims, and internal doc links (relative links to other files in the repo must resolve).`
  }
  return `${COMMON}

LIGHT AUDIT. Read each of these documentation files (skim for checkable claims; most content here is design intent or historical notes, which you must NOT flag):
- ${fileList}

Check ONLY: (1) referenced repo file paths and internal links that no longer exist, (2) commands/npm scripts that don't exist in any package.json, (3) explicit current-status claims ("X is not implemented", "X currently does Y", "status: in progress") contradicted by the code, (4) version numbers stated as current that contradict package.json. Expect few or zero findings; an empty list is a good answer.`
}

function verifyPrompt(f) {
  return `${COMMON}

ADVERSARIAL VERIFICATION. Another agent claims this documentation statement is stale. Your job is to try to REFUTE that. Read the doc file and the cited code yourself.

Doc file: ${f.file}
Doc quote: ${JSON.stringify(f.quote)}
Alleged stale claim: ${f.claim}
Alleged evidence: ${f.evidence}
Proposed correction: ${f.correction}

Return isStale=true ONLY if you independently confirm: (a) the quote exists in the doc, (b) it asserts current codebase state (not a plan, opinion, or dated record), and (c) the code today contradicts it. If uncertain, if the statement is defensible, or if the "correction" would change design intent rather than fix a fact — return isStale=false. If stale but the proposed correction is wrong or overreaching, supply revisedCorrection with better text.`
}

function fixPrompt(confirmed) {
  return `Repo: Starwards (you are running in the repo root).${DATE_LINE} Apply the following CONFIRMED staleness corrections to documentation files. Each entry was independently verified against the code.

${JSON.stringify(confirmed, null, 2)}

Rules:
- Use Read then Edit on each doc. Make minimal, surgical edits: fix only the stale fact, preserve the document's tone, structure, and formatting. Use revisedCorrection over correction when present.
- Before each edit, sanity-check the correction against the code one more time; if it does not hold up, skip it and list it under "skipped" with a one-line reason. Do not "fix" design intent, opinions, or dated/historical records.
- Do not add editorial notes, changelog lines, or "updated on" stamps. Do not restructure sections. Do not fix anything not listed here.
Return the list of edits made (file + one-line summary each) and any skipped corrections.`
}

function verifyAppliedPrompt(unitKey, confirmed) {
  const items = confirmed.map((c) => ({ file: c.file, staleText: c.quote, correction: c.correction }))
  return `READ-BACK VERIFICATION — measurement only. Do NOT edit anything; use Read/Grep exclusively.

The corrections below were supposed to have just been applied to documentation files in unit "${unitKey}". For EACH entry, open the file and determine whether the correction actually landed.

${JSON.stringify(items, null, 2)}

Judge by meaning, not exact characters (minor wording/formatting differences are fine). Return one result per entry: { file, applied, note }. Set applied=true ONLY if the file now reflects the correction — the stale text is gone AND the corrected fact is present. If the stale text is still there, or you cannot confirm the change landed, set applied=false with a one-line note.`
}

// ---- Budget ----
const budgetConstrained = typeof budget !== 'undefined' && budget && budget.total
const budgetLow = () => budgetConstrained && budget.remaining() < 60_000
if (budgetConstrained) log(`Token budget: ${Math.round(budget.total / 1000)}k target`)

// ---- Discover ----
phase('Discover')
log(`Discovering docs under ${ROOT}/ (apply=${APPLY}${TODAY ? `, today=${TODAY}` : ''})`)
const discovered = await agent(discoveryPrompt(), { label: 'discover', phase: 'Discover', schema: DISCOVERY, model: 'sonnet' })

// Normalize the discovery output deterministically — don't rely on the agent to
// honor the exclude list or keep units disjoint. Enforce exclusions, drop any file
// already claimed by an earlier unit (so no file is edited by two fix agents), and
// drop units that become empty.
const isExcluded = (p) => EXCLUDE.some((sub) => p.includes(sub))
const seen = new Set()
let droppedExcluded = 0
let droppedDup = 0
const UNITS = (((discovered && discovered.units) || [])
  .map((u) => {
    if (!u || !Array.isArray(u.files)) return null
    const files = []
    for (const f of u.files) {
      if (!f) continue
      if (isExcluded(f)) { droppedExcluded++; continue }
      if (seen.has(f)) { droppedDup++; continue }
      seen.add(f)
      files.push(f)
    }
    return files.length ? { ...u, files } : null
  })
  .filter(Boolean))

if (!UNITS.length) {
  log('No documentation units discovered — nothing to audit.')
  return { unitsAudited: 0, candidateFindings: 0, confirmedFindings: 0, editsApplied: 0, dryRun: !APPLY, filesAudited: 0, perUnit: [] }
}

// Coverage check: the discovery agent self-reports how many non-excluded files it
// saw; if fewer ended up grouped, some docs were silently skipped — surface it.
const filesAudited = seen.size
const reportedCount = (discovered && discovered.discoveredFileCount) || 0
if (reportedCount && reportedCount > filesAudited) {
  log(`⚠ coverage gap: discovery reported ${reportedCount} non-excluded files but only ${filesAudited} were grouped — ${reportedCount - filesAudited} doc(s) may be unaudited.`)
}
if (droppedExcluded || droppedDup) {
  log(`Normalized units: dropped ${droppedExcluded} excluded and ${droppedDup} duplicate file reference(s).`)
}
log(`Discovered ${UNITS.length} units, ${filesAudited} files (${UNITS.filter((u) => u.depth === 'deep').length} deep, ${UNITS.filter((u) => u.depth === 'light').length} light)`)

// ---- Audit -> Verify -> Fix (pipelined per unit) ----
phase('Audit')
const results = await pipeline(
  UNITS,
  unit => agent(auditPrompt(unit), { label: `audit:${unit.key}`, phase: 'Audit', schema: FINDINGS, model: 'sonnet' }),
  async (audit, unit) => {
    if (!audit || !audit.findings.length) return { unit: unit.key, findings: 0, confirmed: [] }
    if (budgetLow()) {
      log(`verify:${unit.key} → skipped (token budget low); ${audit.findings.length} candidate(s) left unverified`)
      return { unit: unit.key, findings: audit.findings.length, confirmed: [] }
    }
    log(`audit:${unit.key} → ${audit.findings.length} candidate finding(s), verifying`)
    const verdicts = await parallel(audit.findings.map(f => () =>
      agent(verifyPrompt(f), { label: `verify:${unit.key}:${f.file.split('/').pop()}`, phase: 'Verify', schema: VERDICT, model: 'opus' })
        .then(v => ({ f, v }))
    ))
    const confirmed = verdicts.filter(x => x && x.v && x.v.isStale)
      .map(x => ({ ...x.f, correction: x.v.revisedCorrection || x.f.correction, verifierReasoning: x.v.reasoning }))
    return { unit: unit.key, findings: audit.findings.length, confirmed }
  },
  async (res) => {
    if (!res || !res.confirmed.length) return res
    if (!APPLY) {
      log(`dry-run:${res.unit} → ${res.confirmed.length} confirmed correction(s) NOT applied`)
      return { ...res, edits: [], skippedByFixer: ['dry-run: not applied'] }
    }
    if (budgetLow()) {
      log(`fix:${res.unit} → skipped (token budget low); ${res.confirmed.length} confirmed correction(s) NOT applied`)
      return { ...res, edits: [], skippedByFixer: ['budget low: not applied'] }
    }
    log(`fix:${res.unit} → applying ${res.confirmed.length} confirmed correction(s)`)
    const fixed = await agent(fixPrompt(res.confirmed), { label: `fix:${res.unit}`, phase: 'Fix', schema: FIXED, model: 'opus' })
    const claimedEdits = fixed ? (fixed.edits || []) : []
    // Independent read-back (haiku): re-open each doc and measure which corrections
    // actually landed, so editsApplied is a measurement, not the fixer's self-report.
    const readback = await agent(verifyAppliedPrompt(res.unit, res.confirmed), { label: `readback:${res.unit}`, phase: 'Fix', schema: APPLIED, model: 'haiku' })
    const measured = readback && Array.isArray(readback.results) ? readback.results.filter((r) => r && r.applied).length : null
    if (measured !== null && measured !== claimedEdits.length) {
      log(`readback:${res.unit} → fixer claimed ${claimedEdits.length} edit(s), ${measured} verified present in files`)
    }
    return {
      ...res,
      edits: claimedEdits,
      editsVerified: measured,
      skippedByFixer: fixed ? (fixed.skipped || []) : ['fixer agent failed'],
    }
  }
)

const ok = results.filter(Boolean)
const summary = {
  dryRun: !APPLY,
  unitsAudited: ok.length,
  filesAudited,
  candidateFindings: ok.reduce((n, r) => n + (r.findings || 0), 0),
  confirmedFindings: ok.reduce((n, r) => n + (r.confirmed ? r.confirmed.length : 0), 0),
  // editsApplied is the read-back-measured count; falls back to the fixer's self-report
  // only when the read-back agent failed (editsVerified === null).
  editsApplied: ok.reduce((n, r) => n + (typeof r.editsVerified === 'number' ? r.editsVerified : (r.edits ? r.edits.length : 0)), 0),
  editsClaimed: ok.reduce((n, r) => n + (r.edits ? r.edits.length : 0), 0),
  perUnit: ok.filter(r => r.confirmed && r.confirmed.length).map(r => ({
    unit: r.unit,
    confirmed: r.confirmed.map(c => ({ file: c.file, claim: c.claim, correction: c.correction })),
    edits: r.edits || [],
    editsVerified: typeof r.editsVerified === 'number' ? r.editsVerified : null,
    skipped: r.skippedByFixer || [],
  })),
}
log(`Done: ${summary.candidateFindings} candidates, ${summary.confirmedFindings} confirmed, ${summary.editsApplied} edit(s) verified-applied${APPLY ? ` (${summary.editsClaimed} claimed by fixer)` : ' (dry-run, none applied)'}`)
return summary
