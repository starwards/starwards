#!/bin/bash
# List and filter GitHub issues
# Usage: ./issue-list.sh <REPO> [--assignee USER] [--label LABEL] [--state STATE]
# Example: ./issue-list.sh starwards/starwards --label bug --state open

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <REPO> [--assignee USER] [--label LABEL] [--state STATE]"
  echo "Example: $0 starwards/starwards --label bug --state open"
  exit 1
fi

REPO=$1
shift

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

# List issues with all provided filters
$GH issue list --repo "$REPO" "$@" \
  --json number,title,state,labels,assignees,createdAt \
  --jq '.[] | "#\(.number): \(.title)\n  State: \(.state)\n  Labels: \([.labels[].name] | join(", "))\n  Assignees: \([.assignees[].login] | join(", "))\n  Created: \(.createdAt[:10])\n"'
