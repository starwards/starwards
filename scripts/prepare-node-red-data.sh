#!/usr/bin/env bash
# Build and pack the starwards nodes into docker/node-red/data, so the data
# manifest's `file:` deps resolve. Shared by dev-node-red.sh (which then
# npm-installs on the host for the compose bind mount) and the preview deploy
# workflow (which bakes the tgz into the node-red wrapper image and installs
# during the image build — see .github/k8s/build-preview-images.sh).
set -e

npm run build:core
npm run build:node-red
# place packed libraries where the data manifest's file: deps expect them
cp ./modules/core/starwards-core-*.tgz ./modules/node-red/starwards-node-red-*.tgz ./docker/node-red/data/
