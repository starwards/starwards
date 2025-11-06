# Rate Limiting

Understanding and managing GitHub API rate limits.

**Note:** All commands assume `$GH` alias is set. Use system gh if available, otherwise /tmp installation.

## Check Rate Limit Status

```bash
# Get all rate limits
$GH api rate_limit

# Get core API rate limit
$GH api rate_limit --jq '.rate | {limit, used, remaining, reset}'

# Get search API rate limit
$GH api rate_limit --jq '.resources.search | {limit, used, remaining, reset}'

# Get GraphQL API rate limit
$GH api rate_limit --jq '.resources.graphql | {limit, used, remaining, reset}'
```

## Rate Limit Tiers

### Core API

```bash
# Authenticated requests
Limit: 5000 requests/hour
Used: [current usage]
Remaining: [requests left]
Reset: [Unix timestamp]

# Unauthenticated requests
Limit: 60 requests/hour
```

### Search API

```bash
# Authenticated requests
Limit: 30 requests/minute

# Unauthenticated requests
Limit: 10 requests/minute
```

### GraphQL API

```bash
# Authenticated requests
Limit: 5000 points/hour
(Different calculation than REST)
```

## Interpret Reset Timestamp

```bash
# Get reset time
$GH api rate_limit --jq '.rate.reset'

# Convert to readable date
$GH api rate_limit --jq '.rate.reset' | xargs -I {} date -d @{}

# Example output:
# Mon Jan 15 14:30:00 UTC 2024
```

## Rate Limit Headers

Rate limit information is included in response headers:

```bash
# View headers with -i flag
$GH api repos/OWNER/REPO -i

# Important headers:
X-RateLimit-Limit: 5000          # Total limit
X-RateLimit-Remaining: 4999      # Requests remaining
X-RateLimit-Reset: 1372700873    # Reset timestamp (Unix)
X-RateLimit-Used: 1              # Requests used
X-RateLimit-Resource: core       # Which rate limit (core, search, etc.)
```

## Best Practices

### 1. Check Before Bulk Operations

```bash
# Check remaining requests before starting
REMAINING=$($GH api rate_limit --jq '.rate.remaining')
if [ $REMAINING -lt 100 ]; then
  echo "Warning: Only $REMAINING requests remaining"
fi
```

### 2. Use Conditional Requests

```bash
# Use ETags for caching (not modified = no rate limit usage)
$GH api repos/OWNER/REPO -i | grep -i 'etag:'
```

### 3. Optimize Queries

```bash
# Use pagination efficiently
$GH api 'repos/OWNER/REPO/issues?per_page=100' # Better than per_page=30

# Use filters to reduce data
$GH api 'repos/OWNER/REPO/issues?state=open' # Better than filtering after

# Request only needed fields (GraphQL-style)
$GH pr list --repo OWNER/REPO --json number,title # Not all fields
```

### 4. Handle Rate Limit Errors

When rate limited, GitHub returns:
```
HTTP 403 Forbidden
X-RateLimit-Remaining: 0

{
  "message": "API rate limit exceeded",
  "documentation_url": "..."
}
```

### 5. Monitor Usage

```bash
# Periodic check during long operations
while [process]; do
  REMAINING=$($GH api rate_limit --jq '.rate.remaining')
  echo "Requests remaining: $REMAINING"
  [do work]
done
```

## Increasing Rate Limits

### Use Authentication

```bash
# Without token: 60 requests/hour
# With token: 5000 requests/hour

# Verify authentication
$GH auth status
```

### Use Multiple Tokens

For very high-volume operations, rotate between multiple tokens:

```bash
# NOT RECOMMENDED for normal use
# Only for legitimate bulk operations with permission
```

### GitHub Enterprise

Enterprise installations may have higher limits. Check with:

```bash
$GH api rate_limit
```

## Secondary Rate Limits

GitHub also enforces secondary limits:

1. **Concurrent Requests:** Too many simultaneous requests
2. **Content Creation:** Creating too many resources quickly
3. **Abuse Detection:** Unusual patterns trigger blocks

**If secondary limited:**
- Slow down request rate
- Use exponential backoff
- Reduce concurrency

## Example: Handling Rate Limits

```bash
#!/bin/bash

if command -v gh &> /dev/null; then
  GH="gh"
else
  GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
fi

# Function to check rate limit
check_rate_limit() {
  local remaining=$($GH api rate_limit --jq '.rate.remaining')
  local reset=$($GH api rate_limit --jq '.rate.reset')

  if [ $remaining -lt 10 ]; then
    echo "Rate limit low: $remaining remaining"
    local now=$(date +%s)
    local wait=$((reset - now))
    echo "Waiting $wait seconds until reset..."
    sleep $wait
  fi
}

# Before bulk operation
check_rate_limit

# Do work
for item in $items; do
  $GH api repos/OWNER/REPO/issues/$item

  # Check periodically
  if [ $((RANDOM % 10)) -eq 0 ]; then
    check_rate_limit
  fi
done
```

## Resources

- GitHub Rate Limiting Docs: https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting
- Best Practices: https://docs.github.com/en/rest/guides/best-practices-for-integrators
