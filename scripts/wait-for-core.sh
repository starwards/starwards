#!/usr/bin/env bash
# Wait for a fresh core build, then start the server.
# tsup's clean:true deletes cjs/ before each build (including watch mode),
# so we wait for the file to disappear then reappear to ensure a fresh build.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CORE_OUTPUT="$PROJECT_DIR/modules/core/cjs/index.js"

echo "Waiting for core watch to start..."

# Phase 1: wait for tsup to clean the output (file disappears)
while [ -f "$CORE_OUTPUT" ]; do
    sleep 0.5
done
echo "Core build cleaning detected..."

# Phase 2: wait for fresh build to complete (file reappears)
while [ ! -f "$CORE_OUTPUT" ]; do
    sleep 0.5
done
echo "Core build ready. Starting server..."

cd "$PROJECT_DIR/modules/server" && exec npm run start
