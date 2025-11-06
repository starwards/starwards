# Pull Requests

Complete command reference for GitHub pull request operations.

**Note:** All commands assume `$GH` alias is set. Use system gh if available, otherwise /tmp installation.

## List Pull Requests

```bash
# All open PRs
$GH pr list --repo OWNER/REPO

# Filter by state
$GH pr list --repo OWNER/REPO --state all        # All PRs
$GH pr list --repo OWNER/REPO --state closed     # Closed PRs
$GH pr list --repo OWNER/REPO --state merged     # Merged PRs

# Filter by author
$GH pr list --repo OWNER/REPO --author USERNAME

# Filter by label
$GH pr list --repo OWNER/REPO --label bug
$GH pr list --repo OWNER/REPO --label "needs review"

# Filter by assignee
$GH pr list --repo OWNER/REPO --assignee USERNAME

# Limit results
$GH pr list --repo OWNER/REPO --limit 20

# JSON output with specific fields
$GH pr list --repo OWNER/REPO --json number,title,state,url,author,createdAt
```

## View Pull Request

```bash
# View PR details
$GH pr view <PR_NUMBER> --repo OWNER/REPO

# Get JSON output
$GH pr view <PR_NUMBER> --repo OWNER/REPO --json number,title,body,state,url

# View PR diff
$GH pr diff <PR_NUMBER> --repo OWNER/REPO

# Get PR checks/statuses
$GH pr checks <PR_NUMBER> --repo OWNER/REPO
```

**Output format for checks:**
```
Check-Name    pass/fail    duration    URL
Test-E2e      fail        3m7s        https://github.com/.../runs/.../job/...
Test-Static   pass        51s         https://github.com/.../runs/.../job/...
Build         pass        1m27s       https://github.com/.../runs/.../job/...
```

## Get PR Reviews

```bash
# List reviews
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/reviews

# Get specific review
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/reviews/<REVIEW_ID>

# Get review comments
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/comments

# Filter approved reviews
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/reviews \
  --jq '.[] | select(.state=="APPROVED") | {user: .user.login, submitted_at: .submitted_at}'
```

## Get PR Commits

```bash
# List commits in PR
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/commits

# Get commit messages
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/commits \
  --jq '.[] | {sha: .sha, message: .commit.message}'
```

## Get PR Files

```bash
# List changed files
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/files

# Get file names only
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/files --jq '.[].filename'

# Get files with status
$GH api repos/OWNER/REPO/pulls/<PR_NUMBER>/files \
  --jq '.[] | {filename: .filename, status: .status, additions: .additions, deletions: .deletions}'
```
