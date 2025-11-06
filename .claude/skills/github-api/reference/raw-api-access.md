# Raw API Access

The `gh api` command provides direct REST API access with authentication.

**Note:** All commands assume `$GH` alias is set. Use system gh if available, otherwise /tmp installation.

## Generic Pattern

```bash
$GH api <endpoint> [flags]
```

## Common Flags

```bash
# --jq <query>       - Parse JSON output with jq
# --paginate        - Automatically fetch all pages
# -X <METHOD>       - HTTP method (GET, POST, PUT, DELETE)
# -f <key=value>    - Form-encoded data
# -F <key=value>    - JSON field data
# -H <header>       - Custom header
```

## Examples

```bash
# GET request
$GH api repos/OWNER/REPO

# POST request
$GH api repos/OWNER/REPO/issues -X POST -F title="Bug" -F body="Description"

# PATCH request
$GH api repos/OWNER/REPO/issues/123 -X PATCH -F state="closed"

# With jq filter
$GH api repos/OWNER/REPO/pulls --jq '.[] | {number, title, state}'

# With pagination
$GH api repos/OWNER/REPO/issues --paginate
```
