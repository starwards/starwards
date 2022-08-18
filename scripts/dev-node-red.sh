#!/usr/bin/env bash

# exit when any command fails
set -e

docker compose -f ./docker/docker-compose.yml down
npm run build:core
npm run build:node-red
# install packed library into ./docker/node-red/data
npm -prefix ./docker/node-red/data install --no-save  ./modules/core/starwards-core-*.tgz ./modules/node-red/starwards-node-red-*.tgz
# fire up the Node-RED docker
docker compose -f ./docker/docker-compose.yml up