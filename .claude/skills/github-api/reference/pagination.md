# Pagination

Strategies for handling paginated API responses.

**Note:** All commands assume `$GH` alias is set. Use system gh if available, otherwise /tmp installation.

## Auto-Pagination

GitHub CLI handles pagination automatically with the `--paginate` flag:

```bash
# Automatically fetch all pages
$GH api repos/OWNER/REPO/issues --paginate

# With jq filter
$GH api repos/OWNER/REPO/issues --paginate --jq '.[].number'
```

**Note:** This can be slow for large result sets. Use with caution.

## Manual Pagination

Control pagination manually with query parameters:

```bash
# Default page size is 30, max is 100
# First page
$GH api 'repos/OWNER/REPO/issues?per_page=100&page=1'

# Second page
$GH api 'repos/OWNER/REPO/issues?per_page=100&page=2'

# Third page
$GH api 'repos/OWNER/REPO/issues?per_page=100&page=3'
```

## Get Total Count

Check response headers to determine total pages:

```bash
# Get headers with -i flag
$GH api repos/OWNER/REPO/issues -i | grep -i '^link:'

# Example Link header:
# Link: <https://api.github.com/repos/.../issues?page=2>; rel="next",
#       <https://api.github.com/repos/.../issues?page=10>; rel="last"
```

## Common Query Parameters

```bash
# per_page - Items per page (default: 30, max: 100)
?per_page=100

# page - Page number (default: 1)
?page=2

# Combine
?per_page=100&page=2
```

## Best Practices

1. **Use `--paginate`** for complete data retrieval when total count is unknown
2. **Use manual pagination** when you only need the first few pages
3. **Set `per_page=100`** to minimize API calls
4. **Check rate limits** before paginating large datasets
5. **Use filters** to reduce result set size when possible
