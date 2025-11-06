#!/bin/bash
# Comprehensive CI workflow debugging
# Downloads logs and analyzes common failure patterns
# Usage: ./workflow-debug.sh <PR_NUMBER> <REPO> [OUTPUT_DIR]
# Example: ./workflow-debug.sh 1826 starwards/starwards /tmp/debug

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <PR_NUMBER> <REPO> [OUTPUT_DIR]"
  echo "Example: $0 1826 starwards/starwards /tmp/debug"
  exit 1
fi

PR_NUMBER=$1
REPO=$2
OUTPUT_DIR=${3:-/tmp/workflow-debug}

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

mkdir -p "$OUTPUT_DIR"

echo "=== Step 1: PR Status ==="
$GH pr view $PR_NUMBER --repo $REPO

echo ""
echo "=== Step 2: Check Results ==="
$GH pr checks $PR_NUMBER --repo $REPO

echo ""
echo "=== Step 3: Identify Failed Jobs ==="
RUN_ID=$($GH pr checks $PR_NUMBER --repo $REPO | grep -oP 'runs/\K[0-9]+' | head -1)

if [ -z "$RUN_ID" ]; then
  echo "No workflow run found for this PR"
  exit 0
fi

echo "Run ID: $RUN_ID"

$GH api repos/$REPO/actions/runs/$RUN_ID/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | {
    name: .name,
    failed_steps: [.steps[] | select(.conclusion=="failure") | .name]
  }'

echo ""
echo "=== Step 4: Download Logs ==="
$GH api repos/$REPO/actions/runs/$RUN_ID/logs --paginate > "$OUTPUT_DIR/logs.zip"
cd "$OUTPUT_DIR" && unzip -o -q logs.zip
echo "Logs extracted to $OUTPUT_DIR"

echo ""
echo "=== Step 5: Analyze Failures ==="

echo "TypeScript errors:"
grep -h "error TS" "$OUTPUT_DIR"/*.txt 2>/dev/null | head -10 || echo "  None found"

echo ""
echo "ESLint errors:"
grep -h "##\[error\]" "$OUTPUT_DIR"/*.txt 2>/dev/null | head -10 || echo "  None found"

echo ""
echo "Test failures:"
grep -h "FAIL.*spec\." "$OUTPUT_DIR"/*.txt 2>/dev/null | head -10 || echo "  None found"

echo ""
echo "E2E failures:"
grep -h "Expected.*Received\|Timeout" "$OUTPUT_DIR"/*.txt 2>/dev/null | head -10 || echo "  None found"

echo ""
echo "Browser errors:"
grep -h "Executable doesn't exist\|browser.*not found" "$OUTPUT_DIR"/*.txt 2>/dev/null || echo "  None found"

echo ""
echo "=== Summary ==="
echo "PR: #$PR_NUMBER"
echo "Run: $RUN_ID"
echo "Logs: $OUTPUT_DIR/*.txt"
echo "Full URL: https://github.com/$REPO/actions/runs/$RUN_ID"
