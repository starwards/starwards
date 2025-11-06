# GitHub API Scripts

Pre-built shell scripts for common GitHub API operations. These scripts can be configured as "always allowed" in Claude Code for faster execution without approval prompts.

## Quick Start

```bash
# Setup gh environment (required first)
source ./.claude/skills/github-api/scripts/setup.sh

# Then use any script
./.claude/skills/github-api/scripts/pr-status.sh 1826 starwards/starwards
```

## Always-Allow Configuration

To avoid approval prompts for these scripts:

1. In Claude Code settings, configure "always allow" for this directory:
   - Path pattern: `.claude/skills/github-api/scripts/*.sh`

2. All scripts in this directory will then execute without requiring approval

This significantly speeds up CI debugging and GitHub operations.

## Available Scripts

### setup.sh
**Purpose:** Detect and configure gh CLI environment

**Usage:**
```bash
source ./.claude/skills/github-api/scripts/setup.sh
```

**What it does:**
- Checks for system-wide `gh` installation
- Falls back to `/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh`
- Exports `$GH` environment variable
- Verifies gh version and authentication

**Run this first** before using other scripts.

---

### pr-status.sh
**Purpose:** Get PR status, checks, and recent reviews

**Usage:**
```bash
./pr-status.sh <PR_NUMBER> <REPO>
```

**Example:**
```bash
./pr-status.sh 1826 starwards/starwards
```

**Output:**
- PR details (title, author, status)
- All check results (passing/failing)
- Recent reviews summary

---

### pr-reviews.sh
**Purpose:** Get detailed PR review history and comments

**Usage:**
```bash
./pr-reviews.sh <PR_NUMBER> <REPO>
```

**Example:**
```bash
./pr-reviews.sh 1826 starwards/starwards
```

**Output:**
- Review counts by state (APPROVED, COMMENTED, etc.)
- All reviews with timestamps
- Inline code review comments

---

### workflow-debug.sh
**Purpose:** Comprehensive CI debugging workflow

**Usage:**
```bash
./workflow-debug.sh <PR_NUMBER> <REPO> [OUTPUT_DIR]
```

**Example:**
```bash
./workflow-debug.sh 1826 starwards/starwards /tmp/debug
```

**What it does:**
1. Shows PR status
2. Lists check results
3. Identifies failed jobs and steps
4. Downloads workflow logs
5. Analyzes common failure patterns:
   - TypeScript errors
   - ESLint errors
   - Test failures
   - E2E failures
   - Browser errors
6. Provides summary and next steps

**This is the most comprehensive script** - use it for complete CI failure analysis.

---

### workflow-failures.sh
**Purpose:** List recent workflow failures

**Usage:**
```bash
./workflow-failures.sh <REPO> [LIMIT]
```

**Example:**
```bash
./workflow-failures.sh starwards/starwards 10
```

**Output:**
- Recent failed workflow runs with details
- Failure summary statistics

---

### download-logs.sh
**Purpose:** Download workflow run logs

**Usage:**
```bash
./download-logs.sh <RUN_ID> <REPO> [OUTPUT_DIR]
```

**Example:**
```bash
./download-logs.sh 19084760492 starwards/starwards /tmp/logs
```

**What it does:**
- Downloads logs for specified workflow run
- Extracts zip to output directory
- Lists available log files

---

### issue-list.sh
**Purpose:** List and filter GitHub issues

**Usage:**
```bash
./issue-list.sh <REPO> [--assignee USER] [--label LABEL] [--state STATE]
```

**Examples:**
```bash
# All open bugs
./issue-list.sh starwards/starwards --label bug --state open

# Your assigned issues
./issue-list.sh starwards/starwards --assignee @me --state open

# Specific user's closed issues
./issue-list.sh starwards/starwards --assignee username --state closed
```

**Output:**
- Issue number and title
- State and labels
- Assignees and created date

---

## Common Workflows

### Debug failing PR
```bash
source ./.claude/skills/github-api/scripts/setup.sh
./.claude/skills/github-api/scripts/workflow-debug.sh 1826 starwards/starwards
```

### Check PR status before merge
```bash
source ./.claude/skills/github-api/scripts/setup.sh
./.claude/skills/github-api/scripts/pr-status.sh 1826 starwards/starwards
./.claude/skills/github-api/scripts/pr-reviews.sh 1826 starwards/starwards
```

### Find recent CI failures
```bash
source ./.claude/skills/github-api/scripts/setup.sh
./.claude/skills/github-api/scripts/workflow-failures.sh starwards/starwards 20
```

### List your open bugs
```bash
source ./.claude/skills/github-api/scripts/setup.sh
USERNAME=$($GH api user --jq '.login')
./.claude/skills/github-api/scripts/issue-list.sh starwards/starwards \
  --assignee $USERNAME --label bug --state open
```

## Requirements

- GitHub CLI (`gh`) installed (system-wide or in `/tmp`)
- `GITHUB_TOKEN` environment variable set
- Required system tools: `unzip`, `grep`, `jq`

## Error Handling

All scripts include:
- Input validation
- Usage help messages
- Automatic gh detection with fallbacks
- Error messages for missing dependencies

If a script fails, it will provide a clear error message indicating what's missing.

## Development

### Adding New Scripts

1. Create script in this directory
2. Follow naming convention: `<feature>-<action>.sh`
3. Include usage help and examples
4. Make executable: `chmod +x script.sh`
5. Test with and without `$GH` set
6. Update this README

### Script Template

```bash
#!/bin/bash
# Description
# Usage: ./script.sh <ARGS>
# Example: ./script.sh example args

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <ARGS>"
  echo "Example: $0 example args"
  exit 1
fi

# Source setup if GH not set
if [ -z "$GH" ]; then
  if command -v gh &> /dev/null; then
    GH="gh"
  elif [ -f "/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh" ]; then
    GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
  else
    echo "Error: gh not found. Run setup.sh first"
    exit 1
  fi
fi

# Script logic here
```

## See Also

- [../SKILL.md](../SKILL.md) - Main skill documentation
- [../EXAMPLES.md](../EXAMPLES.md) - Usage examples
- [../INSTALL.md](../INSTALL.md) - Installation guide
