#!/usr/bin/env bash
# Launch starwards dev environment in Zellij
# Server pane starts as empty shell — run server manually after core finishes initial build

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
zellij action new-tab --layout "$PROJECT_DIR/.zellij/dev.kdl"
