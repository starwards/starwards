# jq Patterns Library

Common jq patterns for parsing and transforming GitHub API JSON responses.

## Extract Fields

### Single Field

```bash
# Extract one field from array
--jq '.[].name'

# Output:
# "value1"
# "value2"
```

### Multiple Fields

```bash
# Extract multiple fields as object
--jq '.[] | {number, title, state}'

# Output:
# {"number": 123, "title": "Fix bug", "state": "open"}
# {"number": 124, "title": "Add feature", "state": "closed"}
```

### Nested Fields

```bash
# Access nested fields
--jq '.[] | {user: .user.login, email: .user.email}'

# Output:
# {"user": "username", "email": "user@example.com"}
```

### Array Fields

```bash
# Extract array elements
--jq '.[] | {labels: [.labels[].name]}'

# Output:
# {"labels": ["bug", "urgent"]}
```

## Filter Results

### By Field Value

```bash
# Filter by exact match
--jq '.[] | select(.state=="open")'

# Filter by partial match (contains)
--jq '.[] | select(.title | contains("bug"))'
```

### Multiple Conditions

```bash
# AND condition
--jq '.[] | select(.state=="open" and .labels[].name=="bug")'

# OR condition
--jq '.[] | select(.state=="open" or .state=="closed")'
```

### Field Existence

```bash
# Check if field exists
--jq '.[] | select(.assignee != null)'

# Check if field is empty
--jq '.[] | select(.assignee == null)'
```

### Comparison

```bash
# Numeric comparison
--jq '.[] | select(.number > 100)'

# String comparison
--jq '.[] | select(.state != "closed")'
```

## Count and Aggregate

### Count Items

```bash
# Count array length
--jq 'length'

# Count nested items
--jq '.[].labels | length'
```

### Sum Values

```bash
# Sum numeric field
--jq 'map(.size) | add'

# Average
--jq 'map(.size) | add / length'
```

### Group By

```bash
# Group by field and count
--jq 'group_by(.state) | map({state: .[0].state, count: length})'

# Output:
# [
#   {"state": "open", "count": 15},
#   {"state": "closed", "count": 42}
# ]
```

## Format Output

### CSV

```bash
# Format as CSV
--jq -r '.[] | [.number, .title, .state] | @csv'

# Output:
# 123,"Fix bug","open"
# 124,"Add feature","closed"
```

### TSV/Table

```bash
# Format as tab-separated
--jq -r '.[] | "\(.number)\t\(.title)\t\(.state)"'

# Output:
# 123    Fix bug        open
# 124    Add feature    closed
```

### Custom Format

```bash
# Custom string format
--jq -r '.[] | "#\(.number): \(.title) (\(.state))"'

# Output:
# #123: Fix bug (open)
# #124: Add feature (closed)
```

### Pretty JSON

```bash
# Pretty-print JSON
--jq '.'

# Compact JSON
--jq -c '.'
```

## Advanced Patterns

### Map and Transform

```bash
# Transform array
--jq 'map({id: .number, name: .title})'

# Output:
# [
#   {"id": 123, "name": "Fix bug"},
#   {"id": 124, "name": "Add feature"}
# ]
```

### Sort Results

```bash
# Sort by field
--jq 'sort_by(.created_at)'

# Sort descending
--jq 'sort_by(.created_at) | reverse'

# Sort by multiple fields
--jq 'sort_by(.state, .number)'
```

### Unique Values

```bash
# Get unique values from array
--jq '[.[].labels[].name] | unique'

# Output:
# ["bug", "enhancement", "urgent"]
```

### Conditional Values

```bash
# Conditional field values
--jq '.[] | {
  number,
  status: (if .state == "open" then "active" else "closed" end)
}'

# Output:
# {"number": 123, "status": "active"}
```

### Nested Selection

```bash
# Select from nested arrays
--jq '.jobs[].steps[] | select(.conclusion=="failure") | .name'

# Complex nested filter
--jq '.[] | select(.labels[] | .name == "bug") | {number, title}'
```

## Common Use Cases

### Failed CI Jobs

```bash
# Get failed job names and steps
--jq '.jobs[] | select(.conclusion=="failure") | {
  name: .name,
  failed_steps: [.steps[] | select(.conclusion=="failure") | .name]
}'
```

### PR Summary

```bash
# PR summary with review count
--jq '{
  number,
  title,
  author: .user.login,
  state,
  reviews: (.requested_reviewers | length)
}'
```

### Issue Statistics

```bash
# Group issues by label
--jq 'group_by(.labels[].name) |
  map({
    label: .[0].labels[0].name,
    count: length,
    open: map(select(.state=="open")) | length
  })'
```

### Commit Authors

```bash
# Get unique commit authors
--jq '[.[].commit.author.name] | unique | sort'
```

## Tips

1. **Use `-r` flag** for raw output (no quotes)
2. **Test incrementally** - Build complex filters step by step
3. **Use `| .`** to pretty-print at any stage
4. **Check null values** - Use `// "default"` for null coalescing
5. **Escape special chars** - Use single quotes for jq expressions

## Common Errors

**"Cannot index array with string"**
→ Accessing object field on array. Use `.[]` first.

**"Cannot iterate over null"**
→ Field doesn't exist. Use `select()` or `// empty` to handle.

**"parse error: Invalid numeric literal"**
→ Syntax error in jq expression. Check quotes and brackets.

## Resources

- jq Manual: https://jqlang.github.io/jq/manual/
- jq Play: https://jqplay.org/ (online testing)
