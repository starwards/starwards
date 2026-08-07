# Searching

GitHub search API for code, issues, PRs, repositories, and users.

**Note:** All commands assume `$GH` alias is set. Use system gh if available, otherwise /tmp installation.

## Search Code

```bash
# Basic search
$GH api search/code -f q='SEARCH_TERM repo:OWNER/REPO'

# Search in specific language
$GH api search/code -f q='SEARCH_TERM language:typescript repo:OWNER/REPO'

# Search in specific path
$GH api search/code -f q='SEARCH_TERM path:src/ repo:OWNER/REPO'

# Search in filename
$GH api search/code -f q='filename:config.json repo:OWNER/REPO'

# Extract results
$GH api search/code -f q='SEARCH_TERM repo:OWNER/REPO' \
  --jq '.items[] | {name: .name, path: .path, html_url: .html_url}'
```

## Search Issues and PRs

```bash
# Search open issues
$GH api search/issues -f q='is:issue is:open repo:OWNER/REPO'

# Search by label
$GH api search/issues -f q='is:issue is:open label:bug repo:OWNER/REPO'

# Search by author
$GH api search/issues -f q='is:issue author:USERNAME repo:OWNER/REPO'

# Search PRs
$GH api search/issues -f q='is:pr is:open repo:OWNER/REPO'

# Search merged PRs
$GH api search/issues -f q='is:pr is:merged repo:OWNER/REPO'

# Complex query
$GH api search/issues -f q='is:issue is:open label:bug created:>2024-01-01 repo:OWNER/REPO'

# Extract results
$GH api search/issues -f q='is:issue label:bug repo:OWNER/REPO' \
  --jq '.items[] | {number, title, state, labels: [.labels[].name]}'
```

## Search Query Qualifiers

### Common Qualifiers

```bash
# Type
is:issue
is:pr

# State
is:open
is:closed
is:merged

# Label
label:bug
label:"help wanted"

# Author/Assignee
author:USERNAME
assignee:USERNAME
no:assignee

# Date filters
created:>2024-01-01
updated:<2024-12-31
closed:2024-01-01..2024-01-31

# Repository
repo:OWNER/REPO

# Language (code search)
language:typescript
language:python

# Path (code search)
path:src/
filename:config.json

# Extension (code search)
extension:ts
extension:js
```

## Rate Limits

**Important:** Search API has stricter rate limits:
- **Authenticated:** 30 requests/minute
- **Unauthenticated:** 10 requests/minute

Check search rate limit:
```bash
$GH api rate_limit --jq '.resources.search'
```

## Best Practices

1. **Be specific** - Use multiple qualifiers to narrow results
2. **Check rate limits** - Search has lower limits than core API
3. **Use pagination** - Add `--paginate` for complete results
4. **Escape spaces** - Use quotes for multi-word values: `label:"help wanted"`
5. **Date formats** - Use ISO 8601: `created:>2024-01-01`
