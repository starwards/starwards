#!/usr/bin/env bash
# Launch starwards dev environment in Zellij
# Server pane starts as empty shell — run server manually after core finishes initial build

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Remove stale core output before starting panes.
# This ensures wait-for-core.sh can simply wait for the file to appear,
# avoiding a race where tsup clean+rebuild completes between poll intervals.
rm -f "$PROJECT_DIR/modules/core/cjs/index.js"

zellij action new-tab --layout "$PROJECT_DIR/.zellij/dev.kdl"
