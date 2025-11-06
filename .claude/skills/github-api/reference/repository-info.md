# Repository Information

Complete command reference for repository data operations.

**Note:** All commands assume `$GH` alias is set. Use system gh if available, otherwise /tmp installation.

## Basic Info

```bash
# View repository
$GH repo view OWNER/REPO

# JSON output with specific fields
$GH repo view OWNER/REPO --json name,description,url,defaultBranchRef,isPrivate,stargazerCount

# Get full repo details
$GH api repos/OWNER/REPO

# Get specific fields
$GH api repos/OWNER/REPO --jq '{name, full_name, description, language, default_branch}'
```

## Branches

```bash
# List all branches
$GH api repos/OWNER/REPO/branches

# Get branch names
$GH api repos/OWNER/REPO/branches --jq '.[].name'

# Get default branch
$GH api repos/OWNER/REPO --jq '.default_branch'

# Get branch protection
$GH api repos/OWNER/REPO/branches/<BRANCH_NAME>/protection
```

## Commits

```bash
# List recent commits
$GH api repos/OWNER/REPO/commits

# Get commit SHAs
$GH api repos/OWNER/REPO/commits --jq '.[].sha'

# Get commit messages
$GH api repos/OWNER/REPO/commits \
  --jq '.[] | {sha: .sha, message: .commit.message, author: .commit.author.name}'

# Get specific commit
$GH api repos/OWNER/REPO/commits/<SHA>

# Get commit diff
$GH api repos/OWNER/REPO/commits/<SHA> --jq '.files[] | {filename, status, patch}'
```

## File Contents

```bash
# Get file from default branch
$GH api repos/OWNER/REPO/contents/path/to/file

# Decode base64 content
$GH api repos/OWNER/REPO/contents/path/to/file \
  --jq -r '.content' | base64 -d

# Save to file
$GH api repos/OWNER/REPO/contents/path/to/file \
  --jq -r '.content' | base64 -d > /tmp/file.txt

# Get file from specific branch
$GH api repos/OWNER/REPO/contents/path/to/file?ref=branch-name

# Get file from specific commit
$GH api repos/OWNER/REPO/contents/path/to/file?ref=<SHA>

# List directory contents
$GH api repos/OWNER/REPO/contents/path/to/directory

# Get file names in directory
$GH api repos/OWNER/REPO/contents/path/to/directory --jq '.[].name'
```

## Contributors

```bash
# List contributors
$GH api repos/OWNER/REPO/contributors

# Get contributor usernames
$GH api repos/OWNER/REPO/contributors --jq '.[].login'

# Get contributor stats
$GH api repos/OWNER/REPO/contributors \
  --jq '.[] | {login: .login, contributions: .contributions}'
```

## Releases

```bash
# List releases
$GH api repos/OWNER/REPO/releases

# Get latest release
$GH api repos/OWNER/REPO/releases/latest

# Get release tag names
$GH api repos/OWNER/REPO/releases --jq '.[].tag_name'

# Get release assets
$GH api repos/OWNER/REPO/releases/latest --jq '.assets[] | {name, download_count, browser_download_url}'
```
