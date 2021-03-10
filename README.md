# starwards

This game's client is designed to run in a chrome browser.

## Developer instructions

This project is not written using TDD. For now, most of the testing is manual. So make sure you are familiar with the areas that are affected by changes you make in the code.

### Project structure

The project is a monorepo, based on [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces). The sub-modules are in the `modules` folder:

-   browser - the frontend client for the game
-   model - the game model objects, used by both client and server
-   server - The game's server

Utility scripts are stored in the `scripts` folder:

-   `pkg.js` packages and compiles the game server into a single, native executable. used by `npm run pkg` command.
-   `post-build.js` copies artifacts into the `./dist` folder. used by `npm run build` command.

### IDE

This project comes pre-configured for [VSCode](https://code.visualstudio.com/).  
### Installing workspace and running commands

to install a development environment, you need to have [node.js](https://nodejs.org/en/download/), and [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) installd. nodejs should be at version 15.11 at least and npm should be at version 7.6 at least
Then, `git clone` this repo locally and run:

```
$ npm install
$ npm test
```

you've just installed the development environment, ran the little tests we have, including linting and type checking.

More commands:

`$ npm run build` - build the project (artifacts are in the `./dist` folder)
`$ npm run prettify` - normalize project code style

## running and debugging a local development server

The `run server` command (in `.vscode/launch.json`) runs a local development API server (game logic and static files serving). you will need to restart the API server manually if you want it to re-load server-side code (changes to the `server` or `model` modules). 

The `debug chrome` command runs a frontend development server that will automatically re-load the client appilcation when changes are made to it, and proxies all API and static files requests to the API server.

After both development servers are up, open your chrome browser at `http://localhost/`.

To quickly host a local game with a remote party, I reccommend you use [ngrok](https://ngrok.com/). just download the executable file to the root of this project and run `./ngrok http` to create an HTTP tunnel to your local server.

### Building executable

At some early point this game was supposed to be served as an execuutable. The build process remained. you can build native executable files for the server by runniing `npm run pkg` (executables will appear in `./dist` folder)
