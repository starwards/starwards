#!/usr/bin/env bash
# Wait for a fresh core build, then start the server.
# dev.sh removes stale core output before launching panes,
# so we just wait for the file to appear from the initial build.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CORE_OUTPUT="$PROJECT_DIR/modules/core/cjs/index.js"

echo "Waiting for core build..."

while [ ! -f "$CORE_OUTPUT" ]; do
    sleep 0.5
done
echo "Core build ready. Starting server..."

cd "$PROJECT_DIR/modules/server" && exec npm run start
