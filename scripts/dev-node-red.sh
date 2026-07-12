#!/usr/bin/env bash

# exit when any command fails
set -e

docker compose -f ./docker/docker-compose.yml down
# build + pack the starwards nodes into docker/node-red/data (shared with CI)
bash ./scripts/prepare-node-red-data.sh
# manifest-driven install (also brings node-red-contrib-osc).
# cd rather than --prefix: npm --prefix from the repo root wrongly adds the
# repo itself as a dependency of the data manifest.
(cd ./docker/node-red/data && npm install)
# fire up the Node-RED docker
docker compose -f ./docker/docker-compose.yml up