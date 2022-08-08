# Contributing to Starwards

Thanks for considering contributing to Starwards!

**First**: if you're unsure of anything, feel free to ask on our [Discord
server][discord-invite-link]. We're a friendly and welcoming bunch!

## Code of Conduct

Before contributing please read our [Code of Conduct](CODE_OF_CONDUCT.md) which
all contributors are expected to adhere to.

## Project structure

The project is a monorepo, based on [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces).

### modules

The sub-modules are in the `modules` folder:

-   browser - The web client for the game (including 3D)
-   core - The game core logic and API objects, may be used by client and/or server
-   server - The game's server
-   e2e - not strictly a module. The End-to-End tests reside here.

### Scripts

Utility scripts are stored in the `scripts` folder:

-   `pkg.js` packages and compiles the game server into a single, native executable. used by `npm run pkg` command.
-   `post-build.js` copies artifacts into the `./dist` folder. used by `npm run build` command.

### Installing and running commands

To install a development environment, you need to have [node.js](https://nodejs.org/en/download/), and [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) installd. nodejs should be at version 15.11 at least and npm should be at version 7.6 at least
Then, `git clone` this repository locally and make sure you can run the following:

```sh
# install all project dependencies
npm ci
# test for static types correctness
npm run test:types
# test formatting (prettier, eslint)
npm run test:format
# run unit, integration and components tests
npm run test
# build all modules
npm run build
# run End-to-End tests
npm run test:e2e
```

more commands:

```sh
# normalize project code style
npm run prettify
# update snapshots for E2E tests on local development environment
npm run test:e2e -- --update-snapshots
# update snapshots for the E2E tests on CI (linux) environment (requires docker. very slow)
npm run snapshots:ci
# generate native binary executables. executables will appear in ./dist folder.
npm run pkg
```

## Looking for something to work on?

If you are new contributor to Starwards going through
[beginners][good-first-issue] should be a good start or you can join our public
[Discord server][discord-invite-link], we would be happy to help finding
something interesting to work on and guide through.

## Filing Issues

Bugs and enhancement suggestions are tracked as GitHub issues.

### Lacking API or feature in Starwards?

If you have a feature idea, but Starwards still doesn't have API required to make
the plugin consider opening [an issue][feature-issue] and describing your
requirements.

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

-   Your new code **adheres to the code style** through running `npm run test:format`.
-   Your new code **passes all existing and new tests** through running `npm run test` and `npm run test:e2e`.

Please keep in mind that this project is not well covered with tests. For now, a lot of the testing is done manually. Please make sure you are familiar with the areas that are affected by changes you make in the code.

## VSCode setup

This project comes pre-configured for [VSCode](https://code.visualstudio.com/). We assume yuo have instlled all recommended plugins.

## Running and debugging a local development environment

Running and debugging requires three running processes.

1. Continously build the core module

    Builds the core module and watches for changes. It is recommended to keep it running at the background while making code changes.

    In VSCode: The `build:core` task (a button at the left of the statusbar).

    ```sh
    cd ./modules/core && npm run build:watch
    ```

2. Web development server

    Runs a frontend development server that will automatically re-load the client appilcation when changes are made to it, and proxies all API and static files requests to the API server. It is recommended to keep it running at the background while making code changes.

    In VSCode: The `webpack:dev server` task (a button at the left of the statusbar).

    ```sh
    cd ./modules/browser && npm start
    ```

    Some versions of NodeJS (17) will require adding an extra flag for this command to work:

    ```sh
    cd ./modules/browser && NODE_OPTIONS=--openssl-legacy-provider npm start
    ```

3. API server

    Runs a local development API server (game logic and static files serving) in debug mode. you will need to restart the API server manually if you want it to re-load server-side code (changes to the `server` or `core` modules).

    In VSCode: The `run server` debug configuration (more about debugging in vscode [Here](https://code.visualstudio.com/docs/editor/debugging))

    ```sh
    node -r ts-node/register/transpile-only ./modules/server/src/dev.ts
    ```

After all three processes are up, open your chrome browser at `http://localhost/`.

### Hosting an internet game

To quickly host a local game with a remote party outside your network, I reccommend you use [ngrok](https://ngrok.com/). just download the executable file to the root of this project and run `./ngrok http` to create an HTTP tunnel to your local server.

[discord-invite-link]: https://discord.gg/p56nSVEjdb
[good-first-issue]: https://github.com/starwards/starwards/labels/good%20first%20issue
[feature-issue]: https://github.com/starwards/starwards/issues/new?assignees=&labels=enhancement%20system
