// #!/usr/bin/env node

var fs = require("fs");
var path = require("path");
var rootPath = path.resolve(__dirname, "..");
try {
  const moduleNames = fs
    .readdirSync(path.resolve(rootPath, "modules"), { withFileTypes: true })
    .filter((n) => n.isDirectory())
    .map((n) => n.name);

  fs.writeFileSync(
    path.join(rootPath, ".circleci", "config.yml"),
    mainWorkflow(moduleNames)
  );

  function mainWorkflow(moduleNames) {
    return `
version: 2.1
orbs:
  node: circleci/node@1.1.6
jobs:
  build-and-test:
    executor:
      name: node/default
    steps:
      - checkout
      - node/with-cache:
          steps:
            - run: yarn install${moduleNames.map(
              (moduleName) => `
            - run: yarn workspace @starwards/${moduleName} lint
            - run: yarn workspace @starwards/${moduleName} test`
            )}

workflows:
    build-and-test:
      jobs:
        - build-and-test`;
  }

  if (fs.existsSync(path.join(rootPath, ".vscode"))) {
    fs.writeFileSync(
      path.join(rootPath, ".vscode", "launch.json"),
      launchJson(moduleNames)
    );

    function launchJson(moduleNames) {
      return JSON.stringify(
        {
          version: "0.2.0",
          configurations: moduleNames
            .map((moduleName) => ({
              type: "node",
              request: "launch",
              name: moduleName + " Mocha Tests",
              program: "${workspaceFolder}/node_modules/mocha/bin/_mocha",
              cwd: "${workspaceFolder}/modules/" + moduleName,
              args: [
                "-r",
                "@ts-tools/node/warn",
                "--timeout",
                "999999",
                "--colors",
                "${workspaceFolder}/modules/" +
                  moduleName +
                  "/test/**/**.spec.ts",
              ],
              internalConsoleOptions: "openOnSessionStart",
            }))
            .concat([
              {
                type: "node",
                request: "launch",
                name: "Mocha Current",
                program: "${workspaceFolder}/node_modules/mocha/bin/_mocha",
                args: [
                  "-r",
                  "@ts-tools/node/warn",
                  "--timeout",
                  "999999",
                  "--colors",
                  "${file}",
                ],
                internalConsoleOptions: "openOnSessionStart",
              },
              {
                type: "node",
                request: "launch",
                name: "run server",
                cwd: "${workspaceFolder}/modules/server",
                args: [
                  "-r",
                  "@ts-tools/node/warn",
                  "${workspaceFolder}/modules/server/src/dev.ts",
                ],
                internalConsoleOptions: "openOnSessionStart",
              },
            ]),
        },
        null,
        2
      );
    }
  }
} catch (e) {
  console.error(e);
}
