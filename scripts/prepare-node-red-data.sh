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
# Drop the lock's integrity pins for the file: tgz deps: npm pack is not
# byte-reproducible, so the committed hashes never match freshly-packed tgz
# and npm install inside the wrapper-image build fails EINTEGRITY. (npm
# install --package-lock-only does NOT refresh file: integrity entries.)
node -e '
    const fs = require("fs");
    const p = "./docker/node-red/data/package-lock.json";
    const lock = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const entry of Object.values(lock.packages)) {
        if (entry.resolved?.startsWith("file:")) delete entry.integrity;
    }
    fs.writeFileSync(p, JSON.stringify(lock, null, 4) + "\n");
'
