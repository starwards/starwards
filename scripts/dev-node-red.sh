#!/usr/bin/env bash

cd ./modules/core
# build library
npm run build
# pack library into ./starwards-core-<version>.tgz
npm pack

cd ../node-red
# build library
npm run build
# pack library into ./starwards-node-red-<version>.tgz
npm pack
# install packed library into ./docker/node-red/data
npm -prefix ./docker/node-red/data install --no-save  ../core/starwards-core-*.tgz ./starwards-node-red-*.tgz
# fire up the Node-RED docker
docker compose -f ./docker/docker-compose.yml up