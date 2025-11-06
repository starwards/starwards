#!/bin/bash
# Get PR review history and comments
# Usage: ./pr-reviews.sh <PR_NUMBER> <REPO>
# Example: ./pr-reviews.sh 1826 starwards/starwards

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <PR_NUMBER> <REPO>"
  echo "Example: $0 1826 starwards/starwards"
  exit 1
fi

PR_NUMBER=$1
REPO=$2

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

echo "=== PR #$PR_NUMBER Review Summary ==="
echo ""

echo "Review counts by state:"
$GH api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq 'group_by(.state) | map({state: .[0].state, count: length}) | .[] | "  \(.state): \(.count)"'

echo ""
echo "All reviews:"
$GH api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq '.[] | "- \(.user.login): \(.state) on \(.submitted_at[:10])\(.body | if . != null and . != "" then "\n  Comment: " + . else "" end)"'

echo ""
echo "Inline comments:"
$GH api repos/$REPO/pulls/$PR_NUMBER/comments \
  --jq '.[] | "- \(.user.login) on \(.path):\(.line)\n  \(.body)\n"' \
  || echo "No inline comments"
