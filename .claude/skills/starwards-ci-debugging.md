---
name: starwards-ci-debugging
description: Debug GitHub Actions CI failures independently using GitHub CLI - install gh binary, authenticate with tokens, download workflow logs, analyze failures (ESLint, TypeScript, E2E, Docker mismatches), and fix issues without manual log copying
version: 2025-11-05
related_skills:
  - starwards-debugging (systematic debugging framework)
  - starwards-verification (verify fixes with test commands)
  - starwards-monorepo (understand build dependencies)
  - using-superpowers (announce skill usage)
---

# CI Debugging for Starwards

## Overview

Waiting for users to manually copy/paste CI logs wastes time and blocks progress.

**Core principle:** ALWAYS set up independent CI log access before attempting to debug failures.

**Environment-specific:** Works in sandboxed Claude Code environment with GitHub token as environment variable.

## The Iron Law

```
NO CI DEBUGGING WITHOUT LOG ACCESS FIRST
```

If you haven't installed GitHub CLI and downloaded logs, you cannot diagnose CI failures.

## When to Use

**Any GitHub Actions failure:**
- Test-Static (TypeScript, ESLint, Prettier)
- Test-Units (Jest test failures)
- Test-E2e (Playwright test failures)
- Build failures
- Workflow configuration errors

## Setup Phase: Enable Independent CI Access

### Step 1: Install GitHub CLI

The execution environment doesn't have `gh` pre-installed. Install it once per session:

```bash
# Download and extract GitHub CLI binary
mkdir -p /tmp/gh-install && cd /tmp/gh-install
curl -sL https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_amd64.tar.gz -o gh.tar.gz
tar xzf gh.tar.gz

# Test installation
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh --version
# Expected: gh version 2.62.0 (2024-11-14)
```

**Why this works:**
- Binary is self-contained, no system install needed
- Works in sandboxed environment
- Full path bypasses PATH issues

### Step 2: Verify Authentication

GitHub token should be in `GITHUB_TOKEN` environment variable:

```bash
# Check token exists and has correct format
printenv GITHUB_TOKEN | head -c 30
# Expected: github_pat_11...

# Verify authentication works
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh auth status
# Expected: ✓ Logged in to github.com account <username> (GITHUB_TOKEN)
```

**If authentication fails:**
- Token must be fine-grained PAT with repository access
- Must have Actions: Read, Contents: Read, Pull requests: Read permissions
- Must have access to starwards/starwards repository

### Step 3: Test API Access

```bash
# Quick test - get PR checks
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh pr checks 1826 --repo starwards/starwards
# Expected: List of checks with pass/fail status and URLs
```

**Output format:**
```
Test-E2e    fail    3m7s    https://github.com/starwards/starwards/actions/runs/.../job/...
Test-Static pass    51s     https://github.com/starwards/starwards/actions/runs/.../job/...
Build       pass    1m27s   https://github.com/starwards/starwards/actions/runs/.../job/...
Test-Units  pass    1m17s   https://github.com/starwards/starwards/actions/runs/.../job/...
```

## Diagnosis Phase: Download and Analyze Logs

### Step 1: Get Workflow Run ID

```bash
# From PR checks output, extract run ID from URL
# Example: https://github.com/starwards/starwards/actions/runs/19084760492/job/...
#                                                              ^^^^^^^^^^ this is the run ID

# Or get it programmatically
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh pr checks <PR_NUMBER> --repo starwards/starwards | grep -oP 'runs/\K[0-9]+' | head -1
```

### Step 2: Download Logs

```bash
# Download all logs as zip file
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh api repos/starwards/starwards/actions/runs/<RUN_ID>/logs --paginate > /tmp/run-logs.zip

# Extract logs
cd /tmp && unzip -o -q run-logs.zip

# List log files
ls -la /tmp/*.txt
# Expected:
# 0_Test-Units.txt
# 1_Build.txt
# 2_Test-E2e.txt
# 3_Test-Static.txt
```

**Why download all logs:**
- Faster than individual API calls
- Can analyze offline
- Complete context available

### Step 3: Identify Failed Jobs

```bash
# Get failed steps from API
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh api repos/starwards/starwards/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | {name, steps: [.steps[] | select(.conclusion=="failure") | .name]}'
```

**Example output:**
```json
{
  "name": "Test-Static",
  "steps": ["Run npm run test:format"]
}
{
  "name": "Test-E2e",
  "steps": ["Run npm run test:e2e"]
}
```

### Step 4: Analyze Specific Failures

**For Test-Static failures:**

```bash
# Find ESLint errors
grep "##\[error\]" /tmp/3_Test-Static.txt

# Find TypeScript errors
grep "error TS" /tmp/3_Test-Static.txt

# Find Prettier failures
grep -A 5 "Code style issues" /tmp/3_Test-Static.txt
```

**For Test-E2e failures:**

```bash
# Find Playwright errors
grep -E "FAIL|Error:" /tmp/2_Test-E2e.txt | head -50

# Find browser launch errors
grep "Executable doesn't exist" /tmp/2_Test-E2e.txt

# Find test assertion failures
grep -A 10 "Expected.*Received" /tmp/2_Test-E2e.txt
```

**For Test-Units failures:**

```bash
# Find test failures
grep -A 20 "FAIL " /tmp/0_Test-Units.txt

# Find timeout errors
grep "Timeout" /tmp/0_Test-Units.txt

# Find assertion errors
grep -B 5 -A 10 "expect.*toEqual\|toBe\|toBeCloseTo" /tmp/0_Test-Units.txt
```

## Common CI Failures and Fixes

### 1. ESLint: Unsafe `any` Type Usage

**Symptoms in logs:**
```
##[error]  192:23  error  Unsafe assignment of an `any` value  @typescript-eslint/no-unsafe-assignment
##[error]  192:61  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
```

**Root cause:** Using `(e as any).code` violates strict TypeScript rules.

**Fix pattern:**
```typescript
// BEFORE (fails lint):
const hasCode = typeof (e as any).code === 'string' && (e as any).code;
const code = String((e as any).code);

// AFTER (passes lint):
function hasStringCode(e: unknown): e is { code: string } {
    return typeof (e as { code?: unknown })?.code === 'string'
        && !!(e as { code?: string }).code;
}

if (hasStringCode(e)) {
    const code = e.code; // Type-safe!
}
```

**Verification:**
```bash
npm run lint
# Expected: No errors
```

### 2. Playwright: Browser Executable Not Found

**Symptoms in logs:**
```
Error: browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell
```

**Root cause:** Docker image version doesn't match installed Playwright version.

**Diagnosis:**
```bash
# Check package version
grep '"@playwright/test"' package.json
# Example: "@playwright/test": "^1.56.1"

# Check package-lock.json for exact version
grep -A 15 'node_modules/@playwright/test"' package-lock.json | grep '"version"' | head -1
# Example: "version": "1.56.1"

# Check CI workflow Docker image
grep "mcr.microsoft.com/playwright" .github/workflows/ci-cd.yml
# Example: image: mcr.microsoft.com/playwright:v1.42.1-jammy
#                                                 ^^^^^^^ MISMATCH!
```

**Fix:**
```yaml
# .github/workflows/ci-cd.yml
Test-E2e:
    runs-on: ubuntu-latest
    container:
        image: mcr.microsoft.com/playwright:v1.56.1-jammy  # Match package version exactly
        options: --user 1001
```

**Available versions:**
```bash
# Query Microsoft Container Registry
curl -s https://mcr.microsoft.com/v2/playwright/tags/list | jq -r '.tags[] | select(startswith("v1.5"))' | sort -V | tail -10
```

**Verification:**
```bash
# After updating workflow, push and check CI
git add .github/workflows/ci-cd.yml
git commit -m "Update Playwright Docker image to v1.56.1"
git push
```

### 3. TypeScript: Type Errors

**Symptoms in logs:**
```
modules/core/src/file.ts(42,15): error TS2322: Type 'string | undefined' is not assignable to type 'string'
```

**Diagnosis in logs:**
```bash
# Find all TypeScript errors
grep "error TS" /tmp/3_Test-Static.txt > /tmp/ts-errors.txt

# Group by error code
grep -oP 'error TS\d+' /tmp/ts-errors.txt | sort | uniq -c
```

**Common patterns:**
- `TS2322`: Type mismatch - add type assertion or fix types
- `TS2532`: Possibly undefined - add null check or `!` assertion
- `TS2345`: Argument type mismatch - check function signature

**Verification:**
```bash
npm run test:types
# Expected: No errors
```

### 4. Test-Units: Flaky Tests

**Symptoms in logs:**
```
connection error: AggregateError
expect(received).toEqual(expected)
  "text": "err: "  // Expected "err: ECONNREFUSED"
```

**Root cause:** Dependency update changed error format.

**Diagnosis pattern:**
1. Check what changed:
   ```bash
   git log --oneline -5
   git diff HEAD~1 package.json
   ```

2. Search for error in logs:
   ```bash
   grep -B 10 -A 10 "expect.*toEqual" /tmp/0_Test-Units.txt
   ```

3. Identify mismatch between expected and actual

**Fix:** Update error handling to match new dependency behavior.

## Integration with CI Workflow

### Full CI Debug Workflow

```bash
# 1. Install gh CLI (once per session)
mkdir -p /tmp/gh-install && cd /tmp/gh-install && \
  curl -sL https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_amd64.tar.gz -o gh.tar.gz && \
  tar xzf gh.tar.gz && cd /home/user/starwards

# 2. Check PR status
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh pr checks <PR_NUMBER> --repo starwards/starwards

# 3. Download logs
RUN_ID=$(...)  # Extract from checks output
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh api repos/starwards/starwards/actions/runs/$RUN_ID/logs --paginate > /tmp/run-logs.zip
cd /tmp && unzip -o -q run-logs.zip && cd /home/user/starwards

# 4. Analyze failures
grep "##\[error\]" /tmp/3_Test-Static.txt
grep -E "FAIL|Error:" /tmp/2_Test-E2e.txt | head -30

# 5. Fix issues locally
# ... make fixes ...

# 6. Verify locally
npm run lint
npm run test:types
npm test
npm run build

# 7. Commit and push
git add -A
git commit -m "Fix CI failures: ..."
git push
```

### Monitoring CI After Push

```bash
# Wait a moment for CI to start
sleep 30

# Check new run status
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh pr checks <PR_NUMBER> --repo starwards/starwards

# If still failing, repeat diagnosis
```

## Environment Limitations

### What Works
- ✅ GitHub CLI binary installation
- ✅ Authentication via GITHUB_TOKEN env var
- ✅ Downloading logs as zip
- ✅ Analyzing text logs with grep/jq
- ✅ Full Git operations

### What Doesn't Work
- ❌ `gh` commands without full path (not in PATH)
- ❌ Setting environment variables with `export` (sandbox limitation)
- ❌ Using `$GH_TOKEN` vs `$GITHUB_TOKEN` (must use GITHUB_TOKEN)
- ❌ Real-time log streaming (must download complete logs)

### Workarounds

**PATH issue:**
```bash
# DON'T: export PATH="/tmp/gh-install/.../bin:$PATH"
# Permission denied in sandbox

# DO: Use full path every time
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh <command>
```

**Empty token issue:**
```bash
# If printenv shows token but wc -c shows 1:
printf '%s' "$GITHUB_TOKEN" | wc -c  # Check without newline

# Token visible in printenv but empty in commands = environment quirk
# Solution: Token must be set before shell starts, not during
```

## Integration with Other Skills

- **starwards-debugging** - Use for local reproduction of CI failures
- **starwards-verification** - Run verification commands locally before push
- **starwards-monorepo** - Understand which modules need rebuilding
- **starwards-workflow** - Know which terminal commands correspond to CI steps

## Checklist: CI Debugging

```bash
# ☐ Install GitHub CLI (/tmp/gh-install/...)
# ☐ Verify auth (gh auth status)
# ☐ Get PR checks (gh pr checks <PR>)
# ☐ Download logs (gh api .../logs)
# ☐ Extract zip (unzip run-logs.zip)
# ☐ Identify failures (grep for errors)
# ☐ Reproduce locally (npm run ...)
# ☐ Fix root cause (not symptoms)
# ☐ Verify locally (all test commands)
# ☐ Commit and push
# ☐ Monitor new CI run
```

## Real-World Example

**Scenario: PR #1826 failing with Test-Static and Test-E2e**

**Step 1: Setup**
```bash
mkdir -p /tmp/gh-install && cd /tmp/gh-install
curl -sL https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_amd64.tar.gz -o gh.tar.gz
tar xzf gh.tar.gz
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh auth status
# ✓ Logged in
```

**Step 2: Check Status**
```bash
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh pr checks 1826 --repo starwards/starwards
# Test-Static: FAIL
# Test-E2e: FAIL
```

**Step 3: Download Logs**
```bash
/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh api repos/starwards/starwards/actions/runs/19084760492/logs --paginate > /tmp/run-logs.zip
cd /tmp && unzip -o -q run-logs.zip
```

**Step 4: Analyze Test-Static**
```bash
grep "##\[error\]" /tmp/3_Test-Static.txt
# Found: 7 ESLint errors about unsafe `any` usage
# File: modules/core/src/client/connection-manager.ts line 192
```

**Step 5: Analyze Test-E2e**
```bash
grep "Executable doesn't exist" /tmp/2_Test-E2e.txt | head -1
# Found: Playwright browser missing
# Cause: Docker image v1.42.1 vs package v1.56.1
```

**Step 6: Fix Both Issues**
```typescript
// connection-manager.ts: Add type guard
function hasStringCode(e: unknown): e is { code: string } {
    return typeof (e as { code?: unknown })?.code === 'string';
}
```

```yaml
# .github/workflows/ci-cd.yml: Update image
image: mcr.microsoft.com/playwright:v1.56.1-jammy
```

**Step 7: Verify and Push**
```bash
npm run lint      # ✓ Passes
npm run test:types # ✓ Passes
git add -A
git commit -m "Fix CI failures: eslint errors and Playwright version mismatch"
git push
```

**Result: All CI checks pass** ✅
