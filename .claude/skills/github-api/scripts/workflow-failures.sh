#!/bin/bash
# List recent workflow failures
# Usage: ./workflow-failures.sh <REPO> [LIMIT]
# Example: ./workflow-failures.sh starwards/starwards 10

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <REPO> [LIMIT]"
  echo "Example: $0 starwards/starwards 10"
  exit 1
fi

REPO=$1
LIMIT=${2:-20}

# Source setup if GH not set
if [ -z "$GH" ]; then
  if command -v gh &> /dev/null; then
    GH="gh"
  elif [ -f "/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh" ]; then
    GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
  else
    echo "Error: gh not found. Run setup.sh first"
    exit 1
  fi
fi

echo "=== Recent Failed Workflow Runs ==="
echo ""

$GH run list --repo "$REPO" --status failure --limit "$LIMIT" \
  --json databaseId,conclusion,headBranch,event,createdAt,displayTitle \
  --jq '.[] | "Run \(.databaseId): \(.displayTitle)\n  Branch: \(.headBranch) (\(.event))\n  Date: \(.createdAt[:10])\n  URL: https://github.com/'"$REPO"'/actions/runs/\(.databaseId)\n"'

echo ""
echo "=== Failure Summary ==="
$GH run list --repo "$REPO" --limit 50 --json conclusion \
  --jq 'group_by(.conclusion) | map({conclusion: .[0].conclusion, count: length}) | .[] | "  \(.conclusion): \(.count)"'
