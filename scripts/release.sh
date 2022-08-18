#!/usr/bin/env bash

# exit when any command fails
set -e

if [ "$1" != "major" ] && [ "$1" != "minor" ] && [ "$1" != "patch" ];
then
    echo "Could not release!"
    echo "Usage: 'npm run release (major|minor|patch)'"
    echo ""
    exit 1
fi

cd ./modules/core

npm version --no-fund --no-audit $1

VERSION=$(npm pkg get 'version' --ws=false | tr -d '"')
VERSION_NAME=v$VERSION

git add ./package.json

cd ../node-red

npm pkg set dependencies["@starwards/core"]=$VERSION
npm version --no-fund --no-audit $VERSION

git add ./package.json ../../package-lock.json

git commit -s -m "$VERSION_NAME"
git tag "$VERSION_NAME"
echo "Bumped version to $VERSION_NAME"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ $CURRENT_BRANCH = "master" ]
then 
    PUSH = "y"
else
    read -p "Current branch is $CURRENT_BRANCH, push HEAD and tags to $VERSION_NAME? y/n " PUSH
fi
if [ $PUSH = "y" ]
then 
    echo "Pushing to git"
    # git push && git push --tags
else
    echo "Not pushing to git"
fi