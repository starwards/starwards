# GitHub API Examples

Real-world use cases and workflows using GitHub CLI in Claude Code environment.

**Setup:** All examples assume:
```bash
GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
REPO="starwards/starwards"  # Change to your repo
```

## Example 1: Check PR Status and Download Failed Logs

**Scenario:** A PR has failing checks. Get status, identify failed jobs, and download logs for analysis.

```bash
# Get PR number (if you have PR URL)
PR_NUMBER=1826

# Check PR status
$GH pr view $PR_NUMBER --repo $REPO

# Get check statuses
$GH pr checks $PR_NUMBER --repo $REPO
# Output shows which checks failed:
# Test-E2e    fail    3m7s    https://github.com/.../runs/19084760492/job/...
# Test-Static pass    51s     ...
# Build       pass    1m27s   ...

# Extract run ID from checks output URL (e.g., 19084760492)
RUN_ID=$(gh pr checks $PR_NUMBER --repo $REPO | grep -oP 'runs/\K[0-9]+' | head -1)

# Download logs
$GH api repos/$REPO/actions/runs/$RUN_ID/logs --paginate > /tmp/run-logs.zip

# Extract logs
cd /tmp && unzip -o -q run-logs.zip

# Find errors in failed job
grep -E "ERROR|FAIL|\[error\]" /tmp/2_Test-E2e.txt | head -30

# Find specific failure patterns
grep -A 10 "Expected.*Received" /tmp/2_Test-E2e.txt
grep "Timeout" /tmp/2_Test-E2e.txt
```

## Example 2: Find All Open Bugs Assigned to You

**Scenario:** Get a list of all bugs assigned to you across the repository.

```bash
# Get your username
USERNAME=$($GH api user --jq '.login')

# List your assigned bugs
$GH issue list --repo $REPO \
  --assignee $USERNAME \
  --label bug \
  --state open \
  --json number,title,createdAt,labels

# Format as readable list
$GH issue list --repo $REPO \
  --assignee $USERNAME \
  --label bug \
  --state open \
  --json number,title,createdAt \
  --jq '.[] | "#\(.number): \(.title) (opened \(.createdAt[:10]))"'

# Save to file
$GH issue list --repo $REPO \
  --assignee $USERNAME \
  --label bug \
  --state open \
  --json number,title,url \
  --jq -r '.[] | "- [ ] #\(.number): \(.title)\n      \(.url)"' > /tmp/my-bugs.md
```

## Example 3: Compare Local File with Remote

**Scenario:** Check if local file differs from what's in the main branch.

```bash
# Download remote file
$GH api repos/$REPO/contents/package.json \
  --jq -r '.content' | base64 -d > /tmp/remote-package.json

# Compare
diff package.json /tmp/remote-package.json

# Or use git diff style
diff -u /tmp/remote-package.json package.json

# Get file from specific branch
$GH api "repos/$REPO/contents/package.json?ref=develop" \
  --jq -r '.content' | base64 -d > /tmp/develop-package.json

# Compare local with develop branch
diff package.json /tmp/develop-package.json
```

## Example 4: Monitor CI Failures Over Time

**Scenario:** Get statistics on CI failures for the last 50 runs.

```bash
# Get last 50 runs
$GH run list --repo $REPO --limit 50 --json databaseId,status,conclusion,event,createdAt

# Count failures
$GH run list --repo $REPO --limit 50 --json conclusion \
  --jq 'group_by(.conclusion) | map({conclusion: .[0].conclusion, count: length})'

# Get failed runs
$GH run list --repo $REPO --status failure --limit 20 \
  --json databaseId,conclusion,headBranch,event,createdAt \
  --jq '.[] | "Run \(.databaseId): \(.headBranch) (\(.event)) - \(.createdAt[:10])"'

# Get most recent failure
LAST_FAIL=$($GH run list --repo $REPO --status failure --limit 1 \
  --json databaseId --jq '.[0].databaseId')

# Get failed jobs from that run
$GH api repos/$REPO/actions/runs/$LAST_FAIL/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | {name, conclusion, html_url}'
```

## Example 5: List All PRs by Author

**Scenario:** Get all PRs (open and closed) from a specific author.

```bash
AUTHOR="username"

# All PRs by author
$GH pr list --repo $REPO --author $AUTHOR --state all --limit 100 \
  --json number,title,state,createdAt,closedAt

# Count by state
$GH pr list --repo $REPO --author $AUTHOR --state all --limit 100 \
  --json state \
  --jq 'group_by(.state) | map({state: .[0].state, count: length})'

# Get merged PRs only
$GH api search/issues \
  -f q="is:pr is:merged author:$AUTHOR repo:$REPO" \
  --jq '.items[] | "#\(.number): \(.title) (merged \(.closed_at[:10]))"'

# Get PR review stats
$GH pr list --repo $REPO --author $AUTHOR --state merged --limit 10 \
  --json number,reviews \
  --jq '.[] | {pr: .number, review_count: (.reviews | length)}'
```

## Example 6: Find Flaky Tests

**Scenario:** Identify tests that sometimes pass and sometimes fail.

```bash
# Get last 20 workflow runs for a specific workflow
$GH run list --repo $REPO --workflow ci-cd.yml --limit 20 \
  --json databaseId,status,conclusion,headBranch

# For each failed run, get failed job names
for RUN_ID in $($GH run list --repo $REPO --status failure --limit 10 \
  --json databaseId --jq '.[].databaseId'); do
  echo "=== Run $RUN_ID ==="
  $GH api repos/$REPO/actions/runs/$RUN_ID/jobs \
    --jq '.jobs[] | select(.conclusion=="failure") | .name'
done

# Get test failure patterns
for RUN_ID in $($GH run list --repo $REPO --status failure --limit 5 \
  --json databaseId --jq '.[].databaseId'); do
  $GH api repos/$REPO/actions/runs/$RUN_ID/logs --paginate > /tmp/run-$RUN_ID.zip
  cd /tmp && unzip -o -q run-$RUN_ID.zip
  echo "=== Run $RUN_ID failures ==="
  grep -h "FAIL.*test.*spec" /tmp/*.txt || true
done
```

## Example 7: Get PR Review History

**Scenario:** Get all reviews and comments on a PR.

```bash
PR_NUMBER=1826

# Get review summary
$GH api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq '.[] | {user: .user.login, state: .state, submitted_at: .submitted_at}'

# Count reviews by state
$GH api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq 'group_by(.state) | map({state: .[0].state, count: length})'

# Get review comments with text
$GH api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq '.[] | select(.body != null and .body != "") | {
    user: .user.login,
    state: .state,
    body: .body,
    submitted_at: .submitted_at
  }'

# Get inline review comments
$GH api repos/$REPO/pulls/$PR_NUMBER/comments \
  --jq '.[] | {
    user: .user.login,
    path: .path,
    line: .line,
    body: .body
  }'

# Generate review report
echo "# PR #$PR_NUMBER Review Summary" > /tmp/pr-review.md
echo "" >> /tmp/pr-review.md
echo "## Reviews" >> /tmp/pr-review.md
$GH api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq -r '.[] | "- **\(.user.login)**: \(.state) (\(.submitted_at[:10]))"' \
  >> /tmp/pr-review.md
```

## Example 8: Find Recent Commits by Author

**Scenario:** Get all commits from a specific author in the last month.

```bash
AUTHOR="username"

# Get recent commits
$GH api repos/$REPO/commits \
  --jq '.[] | select(.commit.author.name=="'"$AUTHOR"'") | {
    sha: .sha,
    message: .commit.message,
    date: .commit.author.date
  }' | head -20

# Count commits per day
$GH api repos/$REPO/commits --paginate \
  --jq '.[] | select(.commit.author.name=="'"$AUTHOR"'") | .commit.author.date[:10]' \
  | sort | uniq -c

# Get commit with most files changed
$GH api repos/$REPO/commits --paginate \
  --jq '.[] | select(.commit.author.name=="'"$AUTHOR"'") | .sha' \
  | head -20 \
  | while read sha; do
      FILE_COUNT=$($GH api repos/$REPO/commits/$sha --jq '.files | length')
      echo "$FILE_COUNT files changed in $sha"
    done \
  | sort -rn | head -5
```

## Example 9: Download Test Artifacts

**Scenario:** Download test results or coverage reports from a workflow run.

```bash
# Get latest completed run
RUN_ID=$($GH run list --repo $REPO --status completed --limit 1 \
  --json databaseId --jq '.[0].databaseId')

# List artifacts
$GH api repos/$REPO/actions/runs/$RUN_ID/artifacts

# Get artifact IDs and names
$GH api repos/$REPO/actions/runs/$RUN_ID/artifacts \
  --jq '.artifacts[] | {id, name, size_in_bytes, expired}'

# Download specific artifact (e.g., test-results)
ARTIFACT_ID=$($GH api repos/$REPO/actions/runs/$RUN_ID/artifacts \
  --jq '.artifacts[] | select(.name=="test-results") | .id')

if [ -n "$ARTIFACT_ID" ]; then
  $GH api repos/$REPO/actions/artifacts/$ARTIFACT_ID/zip > /tmp/test-results.zip
  cd /tmp && unzip -o test-results.zip
  echo "Test results extracted to /tmp"
fi
```

## Example 10: Comprehensive CI Debug Workflow

**Scenario:** Complete workflow from detecting failure to analyzing root cause.

```bash
#!/bin/bash
set -e

GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
REPO="starwards/starwards"
PR_NUMBER=1826

echo "=== Step 1: Check PR Status ==="
$GH pr view $PR_NUMBER --repo $REPO

echo -e "\n=== Step 2: Get Check Results ==="
$GH pr checks $PR_NUMBER --repo $REPO

echo -e "\n=== Step 3: Identify Failed Jobs ==="
RUN_ID=$($GH pr checks $PR_NUMBER --repo $REPO | grep -oP 'runs/\K[0-9]+' | head -1)
echo "Run ID: $RUN_ID"

$GH api repos/$REPO/actions/runs/$RUN_ID/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | {
    name: .name,
    failed_steps: [.steps[] | select(.conclusion=="failure") | .name]
  }'

echo -e "\n=== Step 4: Download Logs ==="
$GH api repos/$REPO/actions/runs/$RUN_ID/logs --paginate > /tmp/run-logs.zip
cd /tmp && unzip -o -q run-logs.zip
echo "Logs extracted to /tmp"

echo -e "\n=== Step 5: Analyze Failures ==="
# Check for common failure patterns
echo "TypeScript errors:"
grep -h "error TS" /tmp/*.txt | head -10 || echo "None found"

echo -e "\nESLint errors:"
grep -h "##\[error\]" /tmp/*.txt | head -10 || echo "None found"

echo -e "\nTest failures:"
grep -h "FAIL.*spec\." /tmp/*.txt | head -10 || echo "None found"

echo -e "\nBrowser errors:"
grep -h "Executable doesn't exist" /tmp/*.txt || echo "None found"

echo -e "\n=== Step 6: Summary ==="
echo "PR: #$PR_NUMBER"
echo "Run: $RUN_ID"
echo "Logs: /tmp/*.txt"
echo ""
echo "Next steps:"
echo "1. Review errors above"
echo "2. Fix issues locally"
echo "3. Run: npm run lint && npm test && npm run build"
echo "4. Commit and push"
```

## Example 11: Generate Weekly Team Report

**Scenario:** Create a report of team activity for the week.

```bash
#!/bin/bash

GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
REPO="starwards/starwards"
REPORT="/tmp/weekly-report.md"

echo "# Weekly Team Report - $(date +%Y-%m-%d)" > $REPORT
echo "" >> $REPORT

echo "## PRs This Week" >> $REPORT
$GH api search/issues \
  -f q="is:pr repo:$REPO created:>$(date -d '7 days ago' +%Y-%m-%d)" \
  --jq '.items[] | "- #\(.number): \(.title) by @\(.user.login) (\(.state))"' \
  >> $REPORT

echo "" >> $REPORT
echo "## Merged PRs" >> $REPORT
$GH api search/issues \
  -f q="is:pr is:merged repo:$REPO closed:>$(date -d '7 days ago' +%Y-%m-%d)" \
  --jq '.items[] | "- #\(.number): \(.title) by @\(.user.login)"' \
  >> $REPORT

echo "" >> $REPORT
echo "## New Issues" >> $REPORT
$GH api search/issues \
  -f q="is:issue repo:$REPO created:>$(date -d '7 days ago' +%Y-%m-%d)" \
  --jq '.items[] | "- #\(.number): \(.title) [\(.labels[].name | join(", "))]"' \
  >> $REPORT

echo "" >> $REPORT
echo "## Closed Issues" >> $REPORT
$GH api search/issues \
  -f q="is:issue is:closed repo:$REPO closed:>$(date -d '7 days ago' +%Y-%m-%d)" \
  --jq '.items[] | "- #\(.number): \(.title)"' \
  >> $REPORT

echo "Report generated: $REPORT"
cat $REPORT
```

## Example 12: Find Stale PRs

**Scenario:** Identify PRs that haven't been updated in 30+ days.

```bash
# Find stale PRs
$GH api search/issues \
  -f q="is:pr is:open repo:$REPO updated:<$(date -d '30 days ago' +%Y-%m-%d)" \
  --jq '.items[] | {
    number: .number,
    title: .title,
    author: .user.login,
    updated: .updated_at,
    url: .html_url
  }'

# Count by author
$GH api search/issues \
  -f q="is:pr is:open repo:$REPO updated:<$(date -d '30 days ago' +%Y-%m-%d)" \
  --jq '.items | group_by(.user.login) | map({author: .[0].user.login, count: length})'

# Generate reminder list
echo "Stale PRs (30+ days):" > /tmp/stale-prs.txt
$GH api search/issues \
  -f q="is:pr is:open repo:$REPO updated:<$(date -d '30 days ago' +%Y-%m-%d)" \
  --jq -r '.items[] | "- @\(.user.login) PR #\(.number): \(.title)\n  Last updated: \(.updated_at[:10])\n  \(.html_url)\n"' \
  >> /tmp/stale-prs.txt
```

These examples demonstrate practical workflows for common GitHub operations using the CLI in Claude Code's sandboxed environment.
