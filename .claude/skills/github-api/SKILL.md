---
name: github-api
description: Access GitHub API using gh CLI in sandboxed environment - install binary, authenticate with tokens, query repos, PRs, issues, workflow runs, and download artifacts without manual copying
version: 2025-11-05
related_skills:
  - starwards-ci-debugging (specific CI workflow debugging)
  - using-superpowers (announce skill usage)
---

# GitHub API Access for Claude Code

## Overview

Access GitHub's API independently in sandboxed Claude Code environment using GitHub CLI binary.

**Core principle:** Install gh CLI once per session, then use full path for all commands.

**Environment-specific:** Works with GitHub token as `GITHUB_TOKEN` environment variable.

## When to Use

**Any GitHub operation:**
- Check PR status and reviews
- Query workflow runs and job status
- Download workflow logs and artifacts
- List issues and pull requests
- Get repository information
- Access Actions data
- Read file contents from remote repos

## Quick Start

### 1. Install GitHub CLI (once per session)

```bash
mkdir -p /tmp/gh-install && cd /tmp/gh-install && \
  curl -sL https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_amd64.tar.gz -o gh.tar.gz && \
  tar xzf gh.tar.gz && \
  /tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh --version
# Expected: gh version 2.62.0 (2024-11-14)
```

### 2. Verify Authentication

```bash
# Check token
printenv GITHUB_TOKEN | head -c 30
# Expected: github_pat_11... or ghp_...

# Verify auth
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh auth status
# Expected: ✓ Logged in to github.com account <username> (GITHUB_TOKEN)
```

### 3. Test Access

```bash
# Quick test
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh pr list --repo starwards/starwards --limit 3
# Expected: List of recent pull requests
```

## Common Commands

Set up alias for convenience:
```bash
GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
```

### Pull Requests

```bash
# List PRs
$GH pr list --repo OWNER/REPO
$GH pr list --repo OWNER/REPO --state closed --limit 10
$GH pr list --repo OWNER/REPO --label bug

# View PR
$GH pr view <PR_NUMBER> --repo OWNER/REPO
$GH pr checks <PR_NUMBER> --repo OWNER/REPO
$GH pr diff <PR_NUMBER> --repo OWNER/REPO

# Get reviews
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/reviews
```

### Issues

```bash
# List issues
$GH issue list --repo OWNER/REPO
$GH issue list --repo OWNER/REPO --assignee USERNAME
$GH issue list --repo OWNER/REPO --label bug

# View issue
$GH issue view <ISSUE_NUMBER> --repo OWNER/REPO

# Get comments
$GH api repos/OWNER/REPO/issues/<ISSUE_NUMBER>/comments
```

### Workflow Runs

```bash
# List runs
$GH run list --repo OWNER/REPO --limit 10
$GH run list --repo OWNER/REPO --status failure

# View run details
$GH run view <RUN_ID> --repo OWNER/REPO

# Get failed jobs
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | {name, steps: [.steps[] | select(.conclusion=="failure") | .name]}'

# Download logs
$GH api repos/OWNER/REPO/actions/runs/<RUN_ID>/logs --paginate > /tmp/run-logs.zip
cd /tmp && unzip -o -q run-logs.zip
```

### Repository Info

```bash
# View repo
$GH repo view OWNER/REPO
$GH repo view OWNER/REPO --json name,description,url

# List branches
$GH api repos/OWNER/REPO/branches --jq '.[].name'

# Get file contents
$GH api repos/OWNER/REPO/contents/path/to/file --jq -r '.content' | base64 -d
```

## JSON Output & Parsing

Most commands support `--json` and `--jq`:

```bash
# Get specific fields
$GH pr list --repo OWNER/REPO --json number,title,state,url

# Filter with jq
$GH api repos/OWNER/REPO/pulls --jq '.[] | {number, title, state}'

# Count items
$GH api repos/OWNER/REPO/issues --jq 'length'

# Format as table
$GH api repos/OWNER/REPO/pulls --jq -r '.[] | "\(.number)\t\(.title)\t\(.state)"'
```

## Environment Limitations

### What Works
- ✅ GitHub CLI binary installation to /tmp
- ✅ Authentication via GITHUB_TOKEN env var
- ✅ All gh commands with full path
- ✅ Downloading files (logs, artifacts)
- ✅ JSON parsing with jq
- ✅ All REST API endpoints

### What Doesn't Work
- ❌ `gh` commands without full path (not in PATH)
- ❌ Setting environment variables with `export` (sandbox limitation)
- ❌ Interactive commands (use --yes flag when available)
- ❌ Git credential helper integration (use token directly)

### Key Workarounds

**Always use full path:**
```bash
# DON'T: export PATH and use bare `gh`
# DO: Use full path or alias
GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
$GH <command>
```

**Token must be pre-set:**
```bash
# Token must exist in GITHUB_TOKEN before session starts
# Cannot be set with `export` in sandbox
```

**Check rate limits:**
```bash
$GH api rate_limit
# Authenticated: 5000 requests/hour
# Unauthenticated: 60 requests/hour
```

## Additional Resources

For more detailed information, see supplemental files in this skill directory:

### Command Reference (reference/)
- **[raw-api-access.md](./reference/raw-api-access.md)** - Direct REST API access patterns
- **[pull-requests.md](./reference/pull-requests.md)** - PR operations (list, view, reviews, commits, files)
- **[issues.md](./reference/issues.md)** - Issue operations (list, view, comments)
- **[workflow-runs.md](./reference/workflow-runs.md)** - CI/CD operations (runs, jobs, logs, artifacts)
- **[repository-info.md](./reference/repository-info.md)** - Repo data (branches, commits, files, releases)
- **[pagination.md](./reference/pagination.md)** - Auto and manual pagination strategies
- **[searching.md](./reference/searching.md)** - Search code, issues, PRs with qualifiers
- **[jq-patterns.md](./reference/jq-patterns.md)** - JSON parsing, filtering, formatting patterns
- **[rate-limiting.md](./reference/rate-limiting.md)** - Rate limits, monitoring, best practices
- **[api-response-structures.md](./reference/api-response-structures.md)** - JSON response schemas

### Examples & Endpoints
- **[EXAMPLES.md](./EXAMPLES.md)** - Real-world use cases and multi-step workflows
- **[ENDPOINTS.md](./ENDPOINTS.md)** - Complete REST API endpoint reference, URL mappings

## Token Requirements

**Minimum permissions for read-only access:**
- Contents: Read
- Pull requests: Read
- Actions: Read
- Issues: Read (if accessing issues)

**For write operations, add:**
- Contents: Write (for creating files)
- Pull requests: Write (for creating/updating PRs)
- Actions: Write (for triggering workflows)
- Issues: Write (for creating/updating issues)

## Troubleshooting Quick Reference

**"command not found: gh"**
→ Use full path: `/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh`

**"authentication failed"**
→ Check: `printenv GITHUB_TOKEN | head -c 30`

**"API rate limit exceeded"**
→ Check: `gh api rate_limit`

**"404 Not Found"**
→ Verify repo name format: `OWNER/REPO`

**"Empty response"**
→ Add `--paginate` for multi-page results

## Setup Checklist

```bash
# ☐ Install GitHub CLI to /tmp/gh-install
# ☐ Verify gh --version works with full path
# ☐ Check GITHUB_TOKEN exists (printenv)
# ☐ Verify authentication (gh auth status)
# ☐ Test API access (gh pr list or gh repo view)
# ☐ Create GH alias for convenience
# ☐ Check rate limits if making many requests
```

## Integration with Other Skills

- **starwards-ci-debugging** - Specialized CI log analysis and fixes
- **starwards-verification** - Verify changes before pushing
- **starwards-workflow** - Understand development workflow
- **using-superpowers** - Announce skill usage

## Tips

1. **Install once** - binary persists in /tmp for session
2. **Use alias** - set `GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"` in scripts
3. **Parse with jq** - use `--json` and `--jq` for programmatic access
4. **Download to /tmp** - avoid permission issues
5. **Test incrementally** - start with small queries before bulk operations

## Official Documentation

- GitHub REST API: https://docs.github.com/en/rest
- GitHub CLI Manual: https://cli.github.com/manual/
