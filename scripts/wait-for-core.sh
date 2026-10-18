#!/usr/bin/env bash
# Wait for a fresh core build, build bots over it, then start the server.
# The server's bot workers load @starwards/bots from its build.
# dev.sh removes stale core output before launching panes,
# so we just wait for the file to appear from the initial build.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CORE_OUTPUT="$PROJECT_DIR/modules/core/cjs/index.js"

echo "Waiting for core build..."

while [ ! -f "$CORE_OUTPUT" ]; do
    sleep 0.5
done
echo "Core build ready. Building bots..."
(cd "$PROJECT_DIR/modules/bots" && npm run build) || exit 1
echo "Bots build ready. Starting server..."

cd "$PROJECT_DIR/modules/server" && exec npm run start
