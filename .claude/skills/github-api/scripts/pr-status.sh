#!/bin/bash
# Get PR status, checks, and basic info
# Usage: ./pr-status.sh <PR_NUMBER> <REPO>
# Example: ./pr-status.sh 1826 starwards/starwards

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

echo "=== PR #$PR_NUMBER Status ==="
echo ""

# Get PR details
$GH pr view $PR_NUMBER --repo $REPO

echo ""
echo "=== Checks Status ==="
$GH pr checks $PR_NUMBER --repo $REPO

echo ""
echo "=== Recent Reviews ==="
$GH api repos/$REPO/pulls/$PR_NUMBER/reviews \
  --jq '.[-3:] | .[] | "- \(.user.login): \(.state) (\(.submitted_at[:10]))"' \
  || echo "No reviews found"
