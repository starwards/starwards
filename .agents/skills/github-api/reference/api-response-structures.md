# API Response Structures

Common JSON response structures from GitHub API endpoints.

## Pull Request

```json
{
  "number": 123,
  "title": "Fix bug",
  "state": "open",
  "user": {
    "login": "username",
    "id": 123456,
    "avatar_url": "https://...",
    "type": "User"
  },
  "body": "Description of the pull request",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-02T00:00:00Z",
  "closed_at": null,
  "merged_at": null,
  "html_url": "https://github.com/owner/repo/pull/123",
  "head": {
    "ref": "feature-branch",
    "sha": "abc123...",
    "repo": { "name": "repo", "full_name": "owner/repo" }
  },
  "base": {
    "ref": "main",
    "sha": "def456...",
    "repo": { "name": "repo", "full_name": "owner/repo" }
  },
  "labels": [
    { "name": "bug", "color": "d73a4a" }
  ],
  "assignees": [
    { "login": "assignee" }
  ],
  "requested_reviewers": [],
  "mergeable": true,
  "mergeable_state": "clean",
  "draft": false
}
```

## Issue

```json
{
  "number": 456,
  "title": "Bug report",
  "state": "open",
  "user": {
    "login": "username",
    "id": 123456
  },
  "body": "Description of the issue",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-02T00:00:00Z",
  "closed_at": null,
  "html_url": "https://github.com/owner/repo/issues/456",
  "labels": [
    { "name": "bug", "color": "d73a4a" }
  ],
  "assignees": [
    { "login": "assignee" }
  ],
  "milestone": {
    "number": 1,
    "title": "v1.0"
  },
  "comments": 5,
  "pull_request": null
}
```

## Workflow Run

```json
{
  "id": 123456789,
  "name": "CI/CD",
  "node_id": "WFR_...",
  "head_branch": "main",
  "head_sha": "abc123...",
  "run_number": 42,
  "event": "push",
  "status": "completed",
  "conclusion": "success",
  "workflow_id": 123,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:05:00Z",
  "html_url": "https://github.com/owner/repo/actions/runs/123456789",
  "jobs_url": "https://api.github.com/repos/owner/repo/actions/runs/123456789/jobs",
  "logs_url": "https://api.github.com/repos/owner/repo/actions/runs/123456789/logs",
  "artifacts_url": "https://api.github.com/repos/owner/repo/actions/runs/123456789/artifacts"
}
```

## Job

```json
{
  "id": 987654321,
  "run_id": 123456789,
  "name": "Test",
  "node_id": "CR_...",
  "head_sha": "abc123...",
  "status": "completed",
  "conclusion": "failure",
  "started_at": "2024-01-01T00:00:00Z",
  "completed_at": "2024-01-01T00:03:00Z",
  "html_url": "https://github.com/owner/repo/runs/987654321",
  "steps": [
    {
      "name": "Set up job",
      "status": "completed",
      "conclusion": "success",
      "number": 1,
      "started_at": "2024-01-01T00:00:00Z",
      "completed_at": "2024-01-01T00:00:05Z"
    },
    {
      "name": "Run tests",
      "status": "completed",
      "conclusion": "failure",
      "number": 3,
      "started_at": "2024-01-01T00:01:00Z",
      "completed_at": "2024-01-01T00:03:00Z"
    }
  ]
}
```

## Repository

```json
{
  "id": 123456,
  "name": "repo",
  "full_name": "owner/repo",
  "owner": {
    "login": "owner",
    "id": 789,
    "type": "User"
  },
  "private": false,
  "html_url": "https://github.com/owner/repo",
  "description": "Repository description",
  "fork": false,
  "created_at": "2020-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "pushed_at": "2024-01-01T12:00:00Z",
  "size": 1234,
  "stargazers_count": 100,
  "watchers_count": 100,
  "language": "TypeScript",
  "forks_count": 25,
  "open_issues_count": 10,
  "default_branch": "main",
  "topics": ["typescript", "nodejs"],
  "visibility": "public",
  "license": {
    "key": "mit",
    "name": "MIT License"
  }
}
```

## Commit

```json
{
  "sha": "abc123...",
  "node_id": "C_...",
  "commit": {
    "author": {
      "name": "Author Name",
      "email": "author@example.com",
      "date": "2024-01-01T00:00:00Z"
    },
    "committer": {
      "name": "Committer Name",
      "email": "committer@example.com",
      "date": "2024-01-01T00:00:00Z"
    },
    "message": "Commit message",
    "tree": {
      "sha": "def456...",
      "url": "..."
    },
    "comment_count": 0
  },
  "author": {
    "login": "username",
    "id": 123456
  },
  "committer": {
    "login": "username",
    "id": 123456
  },
  "parents": [
    { "sha": "parent123...", "url": "..." }
  ],
  "files": [
    {
      "filename": "src/file.ts",
      "additions": 10,
      "deletions": 5,
      "changes": 15,
      "status": "modified",
      "patch": "@@ -1,5 +1,10 @@\n..."
    }
  ]
}
```

## Review

```json
{
  "id": 12345,
  "user": {
    "login": "reviewer",
    "id": 789
  },
  "body": "Review comment",
  "state": "APPROVED",
  "html_url": "https://github.com/owner/repo/pull/123#pullrequestreview-12345",
  "submitted_at": "2024-01-01T00:00:00Z",
  "commit_id": "abc123..."
}
```

**Review states:**
- `APPROVED` - Approved
- `CHANGES_REQUESTED` - Changes requested
- `COMMENTED` - Comment only (no approval/rejection)
- `DISMISSED` - Review was dismissed
- `PENDING` - Review not yet submitted

## Comment

```json
{
  "id": 67890,
  "user": {
    "login": "commenter",
    "id": 456
  },
  "body": "Comment text",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "html_url": "https://github.com/owner/repo/issues/123#issuecomment-67890"
}
```

## Artifact

```json
{
  "id": 111222,
  "node_id": "MDg6...",
  "name": "test-results",
  "size_in_bytes": 12345,
  "url": "https://api.github.com/repos/owner/repo/actions/artifacts/111222",
  "archive_download_url": "https://api.github.com/repos/owner/repo/actions/artifacts/111222/zip",
  "expired": false,
  "created_at": "2024-01-01T00:00:00Z",
  "expires_at": "2024-04-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

## File Content

```json
{
  "name": "file.txt",
  "path": "src/file.txt",
  "sha": "abc123...",
  "size": 1234,
  "url": "https://api.github.com/repos/owner/repo/contents/src/file.txt",
  "html_url": "https://github.com/owner/repo/blob/main/src/file.txt",
  "git_url": "https://api.github.com/repos/owner/repo/git/blobs/abc123...",
  "download_url": "https://raw.githubusercontent.com/owner/repo/main/src/file.txt",
  "type": "file",
  "content": "ZmlsZSBjb250ZW50IGJhc2U2NCBlbmNvZGVk\n",
  "encoding": "base64"
}
```

**Note:** `content` field is base64-encoded. Decode with:
```bash
--jq -r '.content' | base64 -d
```

## Rate Limit

```json
{
  "resources": {
    "core": {
      "limit": 5000,
      "used": 123,
      "remaining": 4877,
      "reset": 1372700873
    },
    "search": {
      "limit": 30,
      "used": 5,
      "remaining": 25,
      "reset": 1372700873
    },
    "graphql": {
      "limit": 5000,
      "used": 0,
      "remaining": 5000,
      "reset": 1372700873
    }
  },
  "rate": {
    "limit": 5000,
    "used": 123,
    "remaining": 4877,
    "reset": 1372700873
  }
}
```

## Common Fields

### User Object
```json
{
  "login": "username",
  "id": 123456,
  "avatar_url": "https://...",
  "type": "User",
  "site_admin": false
}
```

### Label Object
```json
{
  "id": 123,
  "name": "bug",
  "color": "d73a4a",
  "description": "Something isn't working"
}
```

### Milestone Object
```json
{
  "number": 1,
  "title": "v1.0",
  "state": "open",
  "description": "First release",
  "due_on": "2024-12-31T23:59:59Z"
}
```
