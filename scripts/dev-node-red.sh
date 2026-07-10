#!/usr/bin/env bash

# exit when any command fails
set -e

docker compose -f ./docker/docker-compose.yml down
npm run build:core
npm run build:node-red
# place packed libraries where the data manifest's file: deps expect them
cp ./modules/core/starwards-core-*.tgz ./modules/node-red/starwards-node-red-*.tgz ./docker/node-red/data/
# manifest-driven install (also brings node-red-contrib-osc).
# cd rather than --prefix: npm --prefix from the repo root wrongly adds the
# repo itself as a dependency of the data manifest.
(cd ./docker/node-red/data && npm install)
# fire up the Node-RED docker
docker compose -f ./docker/docker-compose.yml up