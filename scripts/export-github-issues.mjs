#!/usr/bin/env node
/**
 * Export GitHub issues and milestones to local markdown files
 * Uses GitHub CLI (gh) for API access
 *
 * Usage: node scripts/export-github-issues.mjs [--repo owner/repo]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const ISSUES_DIR = path.join(ROOT_DIR, '.issues');

// Parse command line args
const args = process.argv.slice(2);
let repo = 'starwards/starwards';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo' && args[i + 1]) {
        repo = args[++i];
    }
}

// Find gh binary
function findGh() {
    try {
        execSync('command -v gh', { encoding: 'utf-8' });
        return 'gh';
    } catch {
        const tmpGh = '/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh';
        try {
            execSync(`${tmpGh} --version`, { encoding: 'utf-8' });
            return tmpGh;
        } catch {
            throw new Error('gh CLI not found. Please install it first.');
        }
    }
}

const GH = findGh();
console.log(`Using gh: ${GH}`);

/**
 * Execute gh command and return parsed JSON
 */
function gh(args) {
    const cmd = `${GH} ${args}`;
    try {
        const result = execSync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large results
        });
        return result;
    } catch (err) {
        console.error(`Command failed: ${cmd}`);
        throw err;
    }
}

/**
 * Fetch all issues using gh with pagination
 */
function fetchAllIssues() {
    console.log('Fetching all issues (this may take a while)...');

    const fields = [
        'number', 'title', 'state', 'labels', 'createdAt', 'updatedAt',
        'assignees', 'body', 'milestone', 'author'
    ].join(',');

    const result = gh(`issue list --repo ${repo} --state all --limit 10000 --json ${fields}`);
    return JSON.parse(result);
}

/**
 * Fetch all milestones using gh API
 */
function fetchAllMilestones() {
    console.log('Fetching all milestones...');

    // Use gh api to get milestones with all states
    const result = gh(`api repos/${repo}/milestones?state=all&per_page=100`);
    return JSON.parse(result);
}

/**
 * Parse blocked-by references from issue body
 */
function parseBlockedBy(body) {
    if (!body) return [];

    const blockedBy = new Set();

    // Match patterns like:
    // - blocked by #123
    // - (blocked by #123)
    // - Blocked by #123
    const patterns = [
        /blocked\s+by\s+#(\d+)/gi,
        /\(blocked\s+by\s+#(\d+)\)/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(body)) !== null) {
            blockedBy.add(parseInt(match[1]));
        }
    }

    return Array.from(blockedBy).sort((a, b) => a - b);
}

/**
 * Parse general issue references from body
 */
function parseRefs(body) {
    if (!body) return [];

    const refs = new Set();

    // Match #123 patterns
    const pattern = /#(\d+)/g;
    let match;
    while ((match = pattern.exec(body)) !== null) {
        refs.add(parseInt(match[1]));
    }

    return Array.from(refs).sort((a, b) => a - b);
}

/**
 * Create URL-friendly slug from title
 */
function slugify(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 50);
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(dateString) {
    if (!dateString) return '';
    return dateString.split('T')[0];
}

/**
 * Format labels array for YAML
 */
function formatLabels(labels) {
    if (!labels || labels.length === 0) return '[]';
    const labelNames = labels.map(l => typeof l === 'string' ? l : l.name);
    return `[${labelNames.join(', ')}]`;
}

/**
 * Format refs array for YAML
 */
function formatRefs(refs) {
    if (!refs || refs.length === 0) return '[]';
    return `[${refs.map(r => `#${r}`).join(', ')}]`;
}

/**
 * Escape title for YAML (handle quotes and special chars)
 */
function escapeTitle(title) {
    if (title.includes('"') || title.includes(':') || title.includes('#')) {
        return JSON.stringify(title);
    }
    return title;
}

/**
 * Generate markdown content for an issue
 */
function generateIssueMarkdown(issue) {
    const blockedBy = parseBlockedBy(issue.body);
    const refs = parseRefs(issue.body).filter(r => !blockedBy.includes(r) && r !== issue.number);

    const assignee = issue.assignees?.[0]?.login || '';
    const milestoneName = issue.milestone?.title || '';

    let content = `---
id: ${issue.number}
title: ${escapeTitle(issue.title)}
status: ${issue.state.toLowerCase()}
labels: ${formatLabels(issue.labels)}
created: ${formatDate(issue.createdAt)}
updated: ${formatDate(issue.updatedAt)}
assignee: ${assignee}
milestone: ${milestoneName ? escapeTitle(milestoneName) : ''}
blocked-by: ${formatRefs(blockedBy)}
refs: ${formatRefs(refs)}
---

`;

    if (issue.body) {
        content += issue.body;
    }

    return content;
}

/**
 * Generate markdown content for a milestone
 */
function generateMilestoneMarkdown(milestone, issues) {
    const milestoneIssues = issues.filter(i => i.milestone?.title === milestone.title);
    const openIssues = milestoneIssues.filter(i => i.state === 'OPEN');
    const closedIssues = milestoneIssues.filter(i => i.state === 'CLOSED');

    let content = `# ${milestone.title}

${milestone.description || ''}

**Status**: ${milestone.state}
**Due**: ${milestone.due_on ? formatDate(milestone.due_on) : 'Not set'}
**Progress**: ${closedIssues.length}/${milestoneIssues.length} closed

## Open Issues (${openIssues.length})

`;

    for (const issue of openIssues.sort((a, b) => a.number - b.number)) {
        const labels = issue.labels?.map(l => l.name).join(', ') || '';
        content += `- #${issue.number} - ${issue.title}${labels ? ` [${labels}]` : ''}\n`;
    }

    content += `
## Closed Issues (${closedIssues.length})

`;

    for (const issue of closedIssues.sort((a, b) => a.number - b.number)) {
        content += `- #${issue.number} - ${issue.title}\n`;
    }

    return content;
}

/**
 * Main export function
 */
async function exportIssues() {
    console.log(`Exporting issues from ${repo}...\n`);

    // Create directory structure
    const openDir = path.join(ISSUES_DIR, 'open');
    const closedDir = path.join(ISSUES_DIR, 'closed');
    const milestonesDir = path.join(ISSUES_DIR, 'milestones');

    // Clean existing directories
    await fs.rm(ISSUES_DIR, { recursive: true, force: true });
    await fs.mkdir(openDir, { recursive: true });
    await fs.mkdir(closedDir, { recursive: true });
    await fs.mkdir(milestonesDir, { recursive: true });

    // Fetch all issues
    console.log('\n=== Fetching Issues ===');
    const issues = fetchAllIssues();
    console.log(`Found ${issues.length} issues`);

    // Fetch milestones
    console.log('\n=== Fetching Milestones ===');
    const milestones = fetchAllMilestones();
    console.log(`Found ${milestones.length} milestones`);

    // Write issue files
    console.log('\n=== Writing Issue Files ===');
    let openCount = 0;
    let closedCount = 0;

    for (const issue of issues) {
        const isOpen = issue.state === 'OPEN';
        const dir = isOpen ? openDir : closedDir;
        const slug = slugify(issue.title);
        const filename = `${issue.number}-${slug}.md`;
        const filepath = path.join(dir, filename);

        const content = generateIssueMarkdown(issue);
        await fs.writeFile(filepath, content);

        if (isOpen) {
            openCount++;
        } else {
            closedCount++;
        }
    }

    console.log(`Wrote ${openCount} open issues`);
    console.log(`Wrote ${closedCount} closed issues`);

    // Write milestone files
    console.log('\n=== Writing Milestone Files ===');
    for (const milestone of milestones) {
        const slug = slugify(milestone.title);
        const filename = `${milestone.number}-${slug}.md`;
        const filepath = path.join(milestonesDir, filename);

        const content = generateMilestoneMarkdown(milestone, issues);
        await fs.writeFile(filepath, content);
    }
    console.log(`Wrote ${milestones.length} milestone files`);

    // Summary
    console.log('\n=== Export Complete ===');
    console.log(`Total issues: ${issues.length}`);
    console.log(`  Open: ${openCount}`);
    console.log(`  Closed: ${closedCount}`);
    console.log(`Total milestones: ${milestones.length}`);
    console.log(`Files written to: ${ISSUES_DIR}`);
}

// Run
exportIssues().catch(err => {
    console.error('Export failed:', err);
    process.exit(1);
});
