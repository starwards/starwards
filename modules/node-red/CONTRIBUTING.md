# Contributing to @starwards/node-red

Thanks for considering contributing to Starwards!

**First**: if you're unsure of anything, feel free to ask on our [Discord server][discord-invite-link]. We're a friendly and welcoming bunch!

## Code of Conduct

Before contributing please read our [Code of Conduct](CODE_OF_CONDUCT.md) which
all contributors are expected to adhere to.

## Project structure

```
node-red/                            * root of the project
 ├──docker/                          * docker-based node-red playground
 │   ├──node-red/                    * folder for the node-red service
 │   │   └──data/                    * files of the node-red playground project
 |   └──docker-compose.yml           * schema of the dockerized playground environment
 |
 ├──src/                             * source files of the node set, where subfolder names = node types
 │   ├──shared/                      * folder for .ts files shared across multiple nodes in the node set
 │   │
 │   └──<node-name>/                 * source files of the node <node-name>
 │       ├──icons/                   * custom icons used by the node set in the editor
 │       │
 │       ├──modules/                 * .ts modules for the runtime side (<node-name>.js file) of the node
 │       │
 │       ├──<node-name>.html/        * files for compiling and bundling into the editor side (<node-name>.html file) of the node
 │       │   ├──modules/             * .ts modules
 │       │   ├──editor.html          * html template for the edit dialog
 │       │   ├──help.html            * html template for the help in the info tab
 │       │   └──index.ts             * entry file
 │       │
 |       ├──<node-name>.ts           * entry file for the runtime side (<node-name>.js file) of the node
 |       └──<node-name>.test.ts      * tests for the <node-name> node
 |
 ├──package.json                     * dependencies and node types for the Node-RED runtime to load
 |
 ├──rollup.config.editor.json        * rollup config for building the editor side of the nodes
 |
 ├──tsconfig.json                    * base typescript config, for the code editor
 ├──tsconfig.runtime.json            * config for creating a production build of the runtime side of the nodes
 └──tsconfig.runtime.watch.json      * config for watching and incremental building the runtime side of the nodes
```

### Installing and running commands

To install a development environment, you need to have [node.js](https://nodejs.org/en/download/), and [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) installd. nodejs should be at version 15.11 at least and npm should be at version 7.6 at least
Then, `git clone` this repository locally and make sure you can run the following:

```sh
# install all project dependencies
npm ci
# test formatting (eslint and prettier)
npm run lint
# create a production build
npm run build
# run tests
npm run test
```

more commands:

```sh
# fix eslint and prettier issues
npm run lint:fix
# run test in watch mode
npm run test:watch
# build & test in Watch mode
npm run dev
```

## Looking for something to work on?

If you are new contributor to Starwards going through
[beginners][good-first-issue] should be a good start or you can join our public
[Discord server][discord-invite-link], we would be happy to help finding
something interesting to work on and guide through.

## Filing Issues

Bugs and enhancement suggestions are tracked as GitHub issues.

### Lacking API or feature in Starwards?

If you have a feature idea, but Starwards still doesn't have API required to make it work,
consider opening [an issue in the main project][feature-issue] and describing your requirements.

### How Do I Submit A (Good) Enhancement Suggestion?

Please provide the following information:

-   Use a **clear and descriptive title** for the issue to identify the
    suggestion.
-   Provide a **description of the suggested enhancement** in as many details as
    necessary.
-   When providing code samples, please use [code blocks][code-blocks].

[code-blocks]: https://help.github.com/articles/creating-and-highlighting-code-blocks/

## Submitting Pull Requests

Please provide the following information:

-   If this is not a trivial fix, consider **creating an issue to discuss first**
    and **later link to it from the PR**.
-   Use a **clear and descriptive title** for the pull request.
    -   Follow [Conventional Commit specification](https://www.conventionalcommits.org/en/v1.0.0/) where sufficiently large or impactful change is made.
-   Provide a **description of the changes** in as many details as necessary.

Before submitting your pull request, also make sure that the following
conditions are met:

-   Your new code **adheres to the code style** through running `npm run lint`.
-   Your new code **passes all existing and new tests** through running `npm run test`.

Please keep in mind that this project is not well covered with tests. For now, a lot of the testing is done manually. Please make sure you are familiar with the areas that are affected by changes you make in the code.

## VSCode setup

This project comes pre-configured for [VSCode](https://code.visualstudio.com/). We assume yuo have instlled all recommended plugins.

## Running and debugging a local playground using docker

We keep an example flow for experimentation in `./docker/node-red/data`. To update it with your local build, Follow these steps:

```sh
# build library
npm run build
# pack library into ./starwards-node-red-<version>.tgz
npm pack
# install packed library into ./docker/node-red/data
npm -prefix ./docker/node-red/data install --no-save ./starwards-node-red-*.tgz
# fire up the Node-RED docker
docker compose -f ./docker/docker-compose.yml up
```

Alternatively, you can [Follow Node-RED docs](https://nodered.org/docs/creating-nodes/first-node#testing-your-node-in-node-red) on how to install the node set into your local Node-RED runtime.

[discord-invite-link]: https://discord.gg/p56nSVEjdb
[good-first-issue]: https://github.com/starwards/node-red/labels/good%20first%20issue
[feature-issue]: https://github.com/starwards/node-red/issues/new?assignees=&labels=enhancement%20system
