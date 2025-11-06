#!/bin/bash
# GitHub CLI Setup and Detection
# Sets up GH environment variable pointing to gh binary
# Usage: source ./setup.sh

set -e

if command -v gh &> /dev/null; then
  export GH="gh"
  echo "✓ Using system gh: $(command -v gh)"
elif [ -f "/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh" ]; then
  export GH="/tmp/gh-install/gh_2.62.0_linux_amd64/bin/gh"
  echo "✓ Using /tmp gh: $GH"
else
  echo "❌ gh not found. See INSTALL.md for installation instructions"
  exit 1
fi

# Verify gh works
$GH --version

# Check authentication
echo ""
echo "Checking authentication..."
if $GH auth status 2>&1 | grep -q "Logged in"; then
  echo "✓ GitHub authentication successful"
else
  echo "⚠ GitHub authentication not configured"
  echo "Ensure GITHUB_TOKEN environment variable is set"
fi

echo ""
echo "Setup complete. GH=$GH"
echo "You can now use \$GH in your commands"
