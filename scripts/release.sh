#!/usr/bin/env bash
if [ "$1" != "major" ] && [ "$1" != "minor" ] && [ "$1" != "patch" ];
then
    echo "Could not release!"
    echo "Usage: 'npm run release (major|minor|patch)'"
    echo ""
    exit 1
fi

cd ./modules/core

NEW_VERSION=$(npm version $1)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

git add package.json package-lock.json
git commit -m 'Bump version'
git tag $NEW_VERSION
echo "Bumped version to $NEW_VERSION"

if [ $CURRENT_BRANCH = "master" ]
then 
    PUSH = "y"
else
    # Prompt for pushing
    read -p "Current branch is $CURRENT_BRANCH, push HEAD and tags to $NEW_VERSION? y/n " PUSH
fi
if [ $PUSH = "y" ]
then 
    echo "Pushing to git"
    git push && git push --tags
else
    echo "Not pushing to git"
fi