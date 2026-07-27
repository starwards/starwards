#!/usr/bin/env node
/* eslint-disable no-console */
// Deterministic checks for the rules in docs/AUTHORING.md.
//
// Complements .claude/workflows/docs-kb-staleness-sweep.js: that workflow uses an LLM to check
// doc *claims* against code; this script checks the mechanical rules an LLM sweep is bad at —
// line-number citations, link resolution, frontmatter validity, absolute paths, tombstones and
// orphans. Cheap enough to run on every commit.
//
// Usage: node scripts/lint-docs.mjs [--quiet]

import { dirname, join, relative, resolve, sep } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const DOCS = join(ROOT, 'docs');
const QUIET = process.argv.includes('--quiet');

// Verbatim external dumps and historical corpora: not held to the authoring rules.
const EXCLUDE = ['docs/reference/', 'docs/MS3/', 'docs/bridge-playtest/ee-reference/'];

// AUTHORING.md: frontmatter is mandatory on entry points and deep, code-mapped docs.
const FRONTMATTER_REQUIRED = [
    'docs/LLM_CONTEXT.md',
    'docs/AUTHORING.md',
    'docs/ARCHITECTURE.md',
    'docs/API_REFERENCE.md',
    'docs/SUBSYSTEMS.md',
    'docs/PATTERNS.md',
    'docs/TECHNICAL_REFERENCE.md',
    'docs/PHYSICS.md',
    'docs/DEPENDENCIES.md',
    'docs/PROJECT_ANALYSIS.md',
    'docs/testing/UTILITIES.md',
];
const AUDIENCE = ['agent', 'human', 'both'];
const DEPTH = ['deep', 'light'];
const STALE_DAYS = 180;

// Entry points the link graph is walked from, for orphan detection.
const ROOTS = ['CLAUDE.md', 'AGENTS.md', 'README.md', 'docs/README.md'];

const problems = [];
const add = (rule, file, detail) => problems.push({ rule, file, detail });

const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (e.endsWith('.md')) out.push(p);
    }
    return out;
};

const rel = (abs) => relative(ROOT, abs).split(sep).join('/');
const excluded = (r) => EXCLUDE.some((e) => r.startsWith(e));

const files = walk(DOCS).map((f) => ({ abs: f, rel: rel(f), src: readFileSync(f, 'utf8') }));

// ---------------------------------------------------------------- rule checks

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const CODE_FENCE = /```[\s\S]*?```/g;
// Double-backtick spans first: AUTHORING.md wraps its ❌ counter-examples in them.
const INLINE_CODE = /``[\s\S]*?``|`[^`\n]*`/g;

for (const f of files) {
    if (excluded(f.rel)) continue;
    // Rules are about prose, not example blocks: AUTHORING.md itself shows ❌ counter-examples.
    const prose = f.src.replace(CODE_FENCE, '').replace(INLINE_CODE, '');

    // Rule 1 — no line-number citations
    for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+\.[a-z]+:\d+(?:-\d+)?)\)/g)) {
        add('rule1-line-number', f.rel, m[1]);
    }

    // Rule 5 — no machine-specific absolute paths
    for (const m of prose.matchAll(/(?:[A-Z]:\\{1,2}Workspace|\/data\/Workspace|\/home\/\w+\/|\/Users\/\w+\/)/g)) {
        add('rule5-absolute-path', f.rel, m[0]);
    }

    // No tombstones — history lives in git
    for (const m of prose.matchAll(
        /\b(?:was retired|used to be|no longer (?:used|exists)|has been removed|formerly known as)\b/gi,
    )) {
        add('tombstone', f.rel, m[0]);
    }

    // Link resolution (relative links only; code samples are not links)
    for (const m of prose.matchAll(LINK)) {
        const target = m[1];
        if (/^(https?:|mailto:|#|data:)/.test(target)) continue;
        const bare = target.split('#')[0];
        if (!bare) continue;
        if (!existsSync(resolve(dirname(f.abs), bare))) add('broken-link', f.rel, target);
    }
}

// Frontmatter
const parseFm = (src) => {
    const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const fm = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([a-z_]+):\s*(.*)$/);
        if (kv) fm[kv[1]] = kv[2].trim();
    }
    return fm;
};

const today = new Date('2026-07-25');
for (const r of FRONTMATTER_REQUIRED) {
    const f = files.find((x) => x.rel === r);
    if (!f) {
        add('frontmatter-missing-file', r, 'required doc not found');
        continue;
    }
    const fm = parseFm(f.src);
    if (!fm) {
        add('frontmatter-missing', r, 'no frontmatter block');
        continue;
    }
    if (!AUDIENCE.includes(fm.audience)) add('frontmatter-enum', r, `audience=${fm.audience}`);
    if (!DEPTH.includes(fm.depth)) add('frontmatter-enum', r, `depth=${fm.depth}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.last_verified || '')) {
        add('frontmatter-date', r, `last_verified=${fm.last_verified}`);
    } else {
        const age = Math.round((today - new Date(fm.last_verified)) / 86400000);
        if (age > STALE_DAYS) add('frontmatter-stale', r, `last_verified ${age} days ago`);
    }
}

// Orphans — docs unreachable by following links from the entry points
const reachable = new Set();
const queue = ROOTS.map((r) => join(ROOT, r)).filter(existsSync);
while (queue.length) {
    const abs = queue.shift();
    const key = rel(abs);
    if (reachable.has(key)) continue;
    reachable.add(key);
    let src;
    try {
        src = readFileSync(abs, 'utf8');
    } catch {
        continue;
    }
    for (const m of src.matchAll(LINK)) {
        const t = m[1];
        if (/^(https?:|mailto:|#|data:)/.test(t)) continue;
        let next = resolve(dirname(abs), t.split('#')[0]);
        if (existsSync(next) && statSync(next).isDirectory()) next = join(next, 'README.md');
        if (existsSync(next) && next.endsWith('.md')) queue.push(next);
    }
}
for (const f of files) {
    if (excluded(f.rel) || reachable.has(f.rel)) continue;
    add('orphan', f.rel, 'unreachable from entry points');
}

// ---------------------------------------------------------------- report

const byRule = new Map();
for (const p of problems) {
    if (!byRule.has(p.rule)) byRule.set(p.rule, []);
    byRule.get(p.rule).push(p);
}

for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${rule}: ${list.length}`);
    if (!QUIET) for (const p of list.slice(0, 20)) console.log(`  ${p.file}  ${p.detail}`);
    if (!QUIET && list.length > 20) console.log(`  … ${list.length - 20} more`);
}

console.log(
    problems.length
        ? `\n${problems.length} problem(s) across ${byRule.size} rule(s) in ${files.length} docs.`
        : `\nClean: ${files.length} docs pass all checks.`,
);
process.exit(problems.length ? 1 : 0);
