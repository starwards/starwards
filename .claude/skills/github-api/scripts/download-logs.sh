#!/bin/bash
# Download workflow run logs
# Usage: ./download-logs.sh <RUN_ID> <REPO> [OUTPUT_DIR]
# Example: ./download-logs.sh 19084760492 starwards/starwards /tmp/logs

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <RUN_ID> <REPO> [OUTPUT_DIR]"
  echo "Example: $0 19084760492 starwards/starwards /tmp/logs"
  exit 1
fi

RUN_ID=$1
REPO=$2
OUTPUT_DIR=${3:-/tmp/workflow-logs}

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

echo "Downloading logs for run $RUN_ID..."
$GH api repos/$REPO/actions/runs/$RUN_ID/logs --paginate > "$OUTPUT_DIR/logs.zip"

echo "Extracting logs..."
cd "$OUTPUT_DIR" && unzip -o -q logs.zip

echo ""
echo "Logs downloaded to: $OUTPUT_DIR"
echo "Available log files:"
ls -lh "$OUTPUT_DIR"/*.txt 2>/dev/null || echo "No .txt files found"
