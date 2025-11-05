# GitHub REST API Endpoints

Complete reference for GitHub REST API endpoints accessible via `gh api`.

**Base URL:** All endpoints are relative to `https://api.github.com`

**Usage:** `$GH api <endpoint>`

## URL to Endpoint Mapping

Common GitHub web URLs and their corresponding API endpoints:

```bash
# GitHub URL → API Endpoint

# Pull Requests
https://github.com/OWNER/REPO/pull/123
→ repos/OWNER/REPO/pulls/123

# Issues
https://github.com/OWNER/REPO/issues/456
→ repos/OWNER/REPO/issues/456

# Workflow Runs
https://github.com/OWNER/REPO/actions/runs/789
→ repos/OWNER/REPO/actions/runs/789

# Commits
https://github.com/OWNER/REPO/commit/abc123
→ repos/OWNER/REPO/commits/abc123

# Branches
https://github.com/OWNER/REPO/tree/branch-name
→ repos/OWNER/REPO/branches/branch-name

# Files
https://github.com/OWNER/REPO/blob/main/path/to/file.ts
→ repos/OWNER/REPO/contents/path/to/file.ts?ref=main
```

## Repository Endpoints

### Repository Info

```bash
# Get repository
GET repos/{owner}/{repo}

# List user repositories
GET user/repos
GET users/{username}/repos

# List organization repositories
GET orgs/{org}/repos

# Get repository topics
GET repos/{owner}/{repo}/topics

# Get repository languages
GET repos/{owner}/{repo}/languages

# Get repository contributors
GET repos/{owner}/{repo}/contributors

# Get repository collaborators
GET repos/{owner}/{repo}/collaborators
```

## Pull Requests

### List & View

```bash
# List pull requests
GET repos/{owner}/{repo}/pulls
GET repos/{owner}/{repo}/pulls?state=open
GET repos/{owner}/{repo}/pulls?state=closed
GET repos/{owner}/{repo}/pulls?state=all

# Get single PR
GET repos/{owner}/{repo}/pulls/{pull_number}

# List PR commits
GET repos/{owner}/{repo}/pulls/{pull_number}/commits

# List PR files
GET repos/{owner}/{repo}/pulls/{pull_number}/files
```

### Reviews & Comments

```bash
# List reviews
GET repos/{owner}/{repo}/pulls/{pull_number}/reviews

# Get single review
GET repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}

# List review comments
GET repos/{owner}/{repo}/pulls/{pull_number}/comments

# List PR comments (issue comments)
GET repos/{owner}/{repo}/issues/{issue_number}/comments
```

### Merge Status

```bash
# Check if merged
GET repos/{owner}/{repo}/pulls/{pull_number}/merge

# Get mergeable state
GET repos/{owner}/{repo}/pulls/{pull_number}
# Check: .mergeable, .mergeable_state fields
```

## Issues

### List & View

```bash
# List repository issues
GET repos/{owner}/{repo}/issues
GET repos/{owner}/{repo}/issues?state=open
GET repos/{owner}/{repo}/issues?state=closed
GET repos/{owner}/{repo}/issues?state=all

# Filter by labels
GET repos/{owner}/{repo}/issues?labels=bug,help+wanted

# Filter by assignee
GET repos/{owner}/{repo}/issues?assignee=username

# Filter by milestone
GET repos/{owner}/{repo}/issues?milestone=1

# Get single issue
GET repos/{owner}/{repo}/issues/{issue_number}
```

### Comments & Events

```bash
# List issue comments
GET repos/{owner}/{repo}/issues/{issue_number}/comments

# List issue events
GET repos/{owner}/{repo}/issues/{issue_number}/events

# Get issue timeline
GET repos/{owner}/{repo}/issues/{issue_number}/timeline
```

### Labels & Milestones

```bash
# List repository labels
GET repos/{owner}/{repo}/labels

# List issue labels
GET repos/{owner}/{repo}/issues/{issue_number}/labels

# List milestones
GET repos/{owner}/{repo}/milestones

# Get milestone
GET repos/{owner}/{repo}/milestones/{milestone_number}
```

## Branches & Commits

### Branches

```bash
# List branches
GET repos/{owner}/{repo}/branches

# Get branch
GET repos/{owner}/{repo}/branches/{branch}

# Get branch protection
GET repos/{owner}/{repo}/branches/{branch}/protection

# Compare branches
GET repos/{owner}/{repo}/compare/{base}...{head}
```

### Commits

```bash
# List commits
GET repos/{owner}/{repo}/commits
GET repos/{owner}/{repo}/commits?sha=branch-name
GET repos/{owner}/{repo}/commits?path=src/file.ts

# Get single commit
GET repos/{owner}/{repo}/commits/{ref}

# Get commit diff
GET repos/{owner}/{repo}/commits/{ref}
# Files in: .files[] array

# List commit comments
GET repos/{owner}/{repo}/commits/{ref}/comments

# Compare commits
GET repos/{owner}/{repo}/compare/{base}...{head}
```

## Contents

### Files & Directories

```bash
# Get contents (file or directory)
GET repos/{owner}/{repo}/contents/{path}

# Get file from specific branch
GET repos/{owner}/{repo}/contents/{path}?ref=branch-name

# Get file from specific commit
GET repos/{owner}/{repo}/contents/{path}?ref={sha}

# Get repository README
GET repos/{owner}/{repo}/readme
GET repos/{owner}/{repo}/readme/{dir}
```

**Note:** File content is returned base64-encoded in `.content` field.

```bash
# Decode file content
$GH api repos/OWNER/REPO/contents/file.txt --jq -r '.content' | base64 -d
```

## Actions (CI/CD)

### Workflows

```bash
# List workflows
GET repos/{owner}/{repo}/actions/workflows

# Get workflow
GET repos/{owner}/{repo}/actions/workflows/{workflow_id}

# Get workflow by filename
GET repos/{owner}/{repo}/actions/workflows/{workflow_file}
```

### Workflow Runs

```bash
# List workflow runs
GET repos/{owner}/{repo}/actions/runs
GET repos/{owner}/{repo}/actions/runs?status=completed
GET repos/{owner}/{repo}/actions/runs?status=success
GET repos/{owner}/{repo}/actions/runs?status=failure

# Filter by workflow
GET repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs

# Filter by branch
GET repos/{owner}/{repo}/actions/runs?branch=main

# Filter by event
GET repos/{owner}/{repo}/actions/runs?event=push
GET repos/{owner}/{repo}/actions/runs?event=pull_request

# Get single run
GET repos/{owner}/{repo}/actions/runs/{run_id}

# List run jobs
GET repos/{owner}/{repo}/actions/runs/{run_id}/jobs

# List run artifacts
GET repos/{owner}/{repo}/actions/runs/{run_id}/artifacts

# Download run logs
GET repos/{owner}/{repo}/actions/runs/{run_id}/logs
# Returns: zip file
```

### Jobs

```bash
# Get job
GET repos/{owner}/{repo}/actions/jobs/{job_id}

# Download job logs
GET repos/{owner}/{repo}/actions/jobs/{job_id}/logs
```

### Artifacts

```bash
# List repository artifacts
GET repos/{owner}/{repo}/actions/artifacts

# Get artifact
GET repos/{owner}/{repo}/actions/artifacts/{artifact_id}

# Download artifact
GET repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip
# Returns: zip file
```

### Secrets

```bash
# List repository secrets
GET repos/{owner}/{repo}/actions/secrets

# List organization secrets
GET orgs/{org}/actions/secrets
```

## Search

### Search Syntax

All search endpoints use the `q` parameter with GitHub search syntax.

```bash
# Generic search
GET search/{resource}?q={query}
```

### Search Code

```bash
# Basic search
GET search/code?q={query}+repo:{owner}/{repo}

# Search in language
GET search/code?q={query}+language:typescript+repo:{owner}/{repo}

# Search in path
GET search/code?q={query}+path:src/+repo:{owner}/{repo}

# Search in filename
GET search/code?q=filename:config.json+repo:{owner}/{repo}

# Complex query examples
GET search/code?q=class+User+language:typescript+repo:{owner}/{repo}
GET search/code?q=TODO+extension:ts+repo:{owner}/{repo}
```

### Search Issues & PRs

```bash
# Search issues
GET search/issues?q=is:issue+repo:{owner}/{repo}
GET search/issues?q=is:issue+is:open+repo:{owner}/{repo}
GET search/issues?q=is:issue+label:bug+repo:{owner}/{repo}

# Search PRs
GET search/issues?q=is:pr+repo:{owner}/{repo}
GET search/issues?q=is:pr+is:merged+repo:{owner}/{repo}
GET search/issues?q=is:pr+review:approved+repo:{owner}/{repo}

# Filter by author
GET search/issues?q=is:issue+author:username+repo:{owner}/{repo}

# Filter by assignee
GET search/issues?q=is:issue+assignee:username+repo:{owner}/{repo}

# Filter by date
GET search/issues?q=is:issue+created:>2024-01-01+repo:{owner}/{repo}
GET search/issues?q=is:pr+merged:2024-01-01..2024-01-31+repo:{owner}/{repo}

# Complex queries
GET search/issues?q=is:issue+is:open+label:bug+no:assignee+repo:{owner}/{repo}
GET search/issues?q=is:pr+is:merged+author:username+merged:>2024-01-01+repo:{owner}/{repo}
```

### Search Repositories

```bash
# Search by name
GET search/repositories?q={name}

# Search by language
GET search/repositories?q=language:typescript

# Search by organization
GET search/repositories?q=org:{org}+language:typescript

# Search by topic
GET search/repositories?q=topic:react

# Filter by stars
GET search/repositories?q=stars:>1000+language:typescript
```

### Search Users

```bash
# Search by username
GET search/users?q={username}

# Search by location
GET search/users?q=location:"{city}"

# Search by followers
GET search/users?q=followers:>1000
```

## Releases

```bash
# List releases
GET repos/{owner}/{repo}/releases

# Get latest release
GET repos/{owner}/{repo}/releases/latest

# Get release by tag
GET repos/{owner}/{repo}/releases/tags/{tag}

# Get release
GET repos/{owner}/{repo}/releases/{release_id}

# List release assets
GET repos/{owner}/{repo}/releases/{release_id}/assets

# Download release asset
GET repos/{owner}/{repo}/releases/assets/{asset_id}
```

## Tags

```bash
# List tags
GET repos/{owner}/{repo}/tags

# Get tag
GET repos/{owner}/{repo}/git/tags/{tag_sha}

# Get lightweight tag (ref)
GET repos/{owner}/{repo}/git/refs/tags/{tag}
```

## Teams & Organizations

```bash
# Get organization
GET orgs/{org}

# List organization members
GET orgs/{org}/members

# List organization teams
GET orgs/{org}/teams

# Get team
GET orgs/{org}/teams/{team_slug}

# List team members
GET orgs/{org}/teams/{team_slug}/members

# List team repositories
GET orgs/{org}/teams/{team_slug}/repos
```

## User & Authentication

```bash
# Get authenticated user
GET user

# Get user
GET users/{username}

# List user repositories
GET users/{username}/repos

# List user organizations
GET users/{username}/orgs

# List user gists
GET users/{username}/gists
```

## Rate Limiting

```bash
# Get rate limit status
GET rate_limit

# Response structure:
{
  "rate": {
    "limit": 5000,
    "remaining": 4999,
    "reset": 1372700873,
    "used": 1
  },
  "resources": {
    "core": { ... },
    "search": { ... },
    "graphql": { ... }
  }
}
```

## Pagination

Most list endpoints support pagination parameters:

```bash
# Parameters
?per_page=100  # Items per page (default: 30, max: 100)
?page=2        # Page number (default: 1)

# Example
GET repos/{owner}/{repo}/issues?per_page=100&page=1
```

**Auto-pagination with gh:**
```bash
$GH api repos/OWNER/REPO/issues --paginate
```

## Response Headers

Useful headers returned by GitHub API:

```bash
# View headers
$GH api repos/OWNER/REPO -i

# Important headers:
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4999
X-RateLimit-Reset: 1372700873

Link: <https://api.github.com/repos/...?page=2>; rel="next",
      <https://api.github.com/repos/...?page=10>; rel="last"
```

## Common Query Parameters

```bash
# Filtering
?state=open|closed|all
?type=all|owner|member
?sort=created|updated|comments
?direction=asc|desc

# Time filtering
?since=2024-01-01T00:00:00Z
?until=2024-12-31T23:59:59Z

# Pagination
?per_page=100
?page=2

# Specific fields (some endpoints)
?fields=field1,field2
```

## HTTP Methods

```bash
# GET - Retrieve resource
$GH api repos/OWNER/REPO

# POST - Create resource
$GH api repos/OWNER/REPO/issues -X POST -F title="Bug" -F body="Description"

# PATCH - Update resource
$GH api repos/OWNER/REPO/issues/123 -X PATCH -F state="closed"

# PUT - Replace resource
$GH api repos/OWNER/REPO/contents/file.txt -X PUT -F message="Update" -F content="..."

# DELETE - Remove resource
$GH api repos/OWNER/REPO/issues/123 -X DELETE
```

## Official Documentation

Full REST API documentation:
- **GitHub REST API:** https://docs.github.com/en/rest
- **API Reference:** https://docs.github.com/en/rest/reference
- **Search Syntax:** https://docs.github.com/en/search-github/searching-on-github
- **Rate Limiting:** https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting

## Notes

- All endpoints require authentication via `GITHUB_TOKEN`
- Most endpoints return JSON
- File contents are base64-encoded
- Logs and artifacts are returned as zip files
- Use `--paginate` flag for complete results
- Check rate limits regularly with `$GH api rate_limit`
