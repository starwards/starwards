# Contributing to @starwards/node-red

Thanks for considering contributing to Starwards!

**First**: if you're unsure of anything, feel free to ask on our [Discord server][discord-invite-link]. We're a friendly and welcoming bunch!

## The starwards project

This module is part of the Starwards monorepo. for general contribution guidelines, like code of conduct, setting up and environment etc, see the root project's [CONTRIBUTING.md](https://github.com/starwards/starwards/blob/master/CONTRIBUTING.md). The rest of this document contains information specific for this module.

## Module structure

```
node-red/                            * root of the project
 ├──src/                             * source files of the node set, where subfolder names = node types
 │   ├──shared/                      * folder for .ts files shared across multiple nodes in the node set
 │   │
 │   └──<node-name>/                 * source files of the node <node-name>
 │       ├──icons/                   * custom icons used by the node set in the editor
 │       │
 │       ├──<node-name>.html/        * files for compiling and bundling into the editor side (<node-name>.html file) of the node
 │       │   ├──modules/             * .ts modules
 │       │   ├──editor.html          * html template for the edit dialog
 │       │   ├──help.html            * html template for the help in the info tab
 │       │   ├──index.ts             * entry file
 │       │   ├── *.ts                * other runtime files for the editor side
 │       │   └── *.spec.ts           * tests
 │       │
 |       ├──<node-name>.ts           * entry file for the runtime side (<node-name>.js file) of the node
 |       ├── *.ts                    * other runtime files for the runtime side
 |       └── *.spec.ts               * tests
 |
 ├──package.json                     * dependencies and node types for the Node-RED runtime to load
 ├──rollup.config.editor.json        * rollup config for building the editor side of the nodes
 ├──tsconfig.json                    * base typescript config, for the code editor
 ├──tsconfig.runtime.json            * config for creating a production build of the runtime side of the nodes
 └──tsconfig.runtime.watch.json      * config for watching and incremental building the runtime side of the nodes
```

## Running and debugging a local playground using docker

We keep an example flow for experimentation in `./docker/node-red/data` (under the root project). To update it with your local build and run, execute this script (under the root project):

`bash ./scripts/dev-node-red.sh`

Alternatively, you can [Follow Node-RED docs](https://nodered.org/docs/creating-nodes/first-node#testing-your-node-in-node-red) on how to install the node set into your local Node-RED runtime.

[discord-invite-link]: https://discord.gg/p56nSVEjdb
[good-first-issue]: https://github.com/starwards/node-red/labels/good%20first%20issue
[feature-issue]: https://github.com/starwards/node-red/issues/new?assignees=&labels=enhancement%20system
