# Issues

Complete command reference for GitHub issue operations.

**Note:** All commands assume `$GH` alias is set. Use system gh if available, otherwise /tmp installation.

## List Issues

```bash
# Open issues
$GH issue list --repo OWNER/REPO

# Filter by state
$GH issue list --repo OWNER/REPO --state all
$GH issue list --repo OWNER/REPO --state closed

# Filter by author
$GH issue list --repo OWNER/REPO --author USERNAME

# Filter by assignee
$GH issue list --repo OWNER/REPO --assignee USERNAME
$GH issue list --repo OWNER/REPO --assignee @me    # Your issues

# Filter by label
$GH issue list --repo OWNER/REPO --label bug
$GH issue list --repo OWNER/REPO --label "help wanted"

# Filter by milestone
$GH issue list --repo OWNER/REPO --milestone "v1.0"

# JSON output
$GH issue list --repo OWNER/REPO --json number,title,state,labels,assignees
```

## View Issue

```bash
# View issue
$GH issue view <ISSUE_NUMBER> --repo OWNER/REPO

# JSON output
$GH issue view <ISSUE_NUMBER> --repo OWNER/REPO --json number,title,body,state,labels

# Get issue comments
$GH api repos/OWNER/REPO/issues/<ISSUE_NUMBER>/comments

# Get comment bodies
$GH api repos/OWNER/REPO/issues/<ISSUE_NUMBER>/comments \
  --jq '.[] | {user: .user.login, body: .body, created_at: .created_at}'
```
