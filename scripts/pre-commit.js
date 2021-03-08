/* eslint-disable no-console */
var fs = require('fs');
var path = require('path');
var rootPath = path.resolve(__dirname, '..');
try {
    const moduleNames = fs
        .readdirSync(path.resolve(rootPath, 'modules'), { withFileTypes: true })
        .filter((n) => n.isDirectory())
        .map((n) => n.name);

    //   fs.writeFileSync(
    //     path.join(rootPath, ".circleci", "config.yml"),
    //     mainWorkflow(moduleNames)
    //   );

    //   function mainWorkflow(moduleNames) {
    //     return `
    // version: 2.1
    // orbs:
    //   node: circleci/node@1.1.6
    // jobs:
    //   build-and-test:
    //     executor:
    //       name: node/default
    //     steps:
    //       - checkout
    //       - node/with-cache:
    //           steps:
    //             - run: yarn install
    //             - run: yarn lint${moduleNames.map(
    //               (moduleName) => `
    //             - run: yarn workspace @starwards/${moduleName} test`
    //             ).join('')}
    //             - run: yarn build
    //             - run: yarn pkg

    // workflows:
    //     build-and-test:
    //       jobs:
    //         - build-and-test`;
    //   }

    if (fs.existsSync(path.join(rootPath, '.vscode'))) {
        fs.writeFileSync(
            path.join(rootPath, '.vscode', 'tasks.json'),
            JSON.stringify(
                {
                    version: '2.0.0',
                    tasks: [
                        {
                            label: 'build:model',
                            options: {
                                cwd: './modules/model',
                            },
                            type: 'npm',
                            script: 'build:watch',
                            isBackground: true,
                            problemMatcher: {
                                owner: 'typescript',
                                fileLocation: 'relative',
                                pattern: {
                                    regexp:
                                        '^([^\\s].*)\\((\\d+|\\d+,\\d+|\\d+,\\d+,\\d+,\\d+)\\):\\s+(error|warning|info)\\s+(TS\\d+)\\s*:\\s*(.*)$',
                                    file: 1,
                                    location: 2,
                                    severity: 3,
                                    code: 4,
                                    message: 5,
                                },
                                background: {
                                    activeOnStart: true,
                                    beginsPattern: 'File change detected',
                                    endsPattern: 'Watching for file changes',
                                },
                            },
                        },
                        {
                            type: 'npm',
                            label: 'webpack: dev server',
                            script: 'start',
                            promptOnClose: true,
                            isBackground: true,
                            options: {
                                cwd: './modules/browser',
                            },
                            problemMatcher: {
                                owner: 'webpack',
                                severity: 'error',
                                fileLocation: 'absolute',
                                pattern: [
                                    {
                                        regexp: 'ERROR in (.*)',
                                        file: 1,
                                    },
                                    {
                                        regexp: '\\((\\d+),(\\d+)\\):(.*)',
                                        line: 1,
                                        column: 2,
                                        message: 3,
                                    },
                                ],
                                background: {
                                    activeOnStart: true,
                                    beginsPattern: 'Built at',
                                    endsPattern: 'Compiled successfully',
                                },
                            },
                        },
                    ],
                },
                null,
                2
            )
        );
        fs.writeFileSync(path.join(rootPath, '.vscode', 'launch.json'), launchJson(moduleNames));
    }
} catch (e) {
    console.error(e);
}

function launchJson(moduleNames) {
    return JSON.stringify(
        {
            version: '0.2.0',
            configurations: moduleNames
                .map((moduleName) => ({
                    type: 'node',
                    request: 'launch',
                    name: moduleName + ' Mocha Tests',
                    program: '${workspaceFolder}/node_modules/mocha/bin/_mocha',
                    cwd: '${workspaceFolder}/modules/' + moduleName,
                    args: [
                        '-r',
                        '@ts-tools/node/r',
                        '--timeout',
                        '999999',
                        '--colors',
                        '${workspaceFolder}/modules/' + moduleName + '/test/**/**.spec.ts',
                    ],
                    internalConsoleOptions: 'openOnSessionStart',
                }))
                .concat([
                    {
                        type: 'node',
                        request: 'launch',
                        name: 'Mocha Current',
                        program: '${workspaceFolder}/node_modules/mocha/bin/_mocha',
                        args: ['-r', '@ts-tools/node/r', '--timeout', '999999', '--colors', '${file}'],
                        internalConsoleOptions: 'openOnSessionStart',
                    },
                    {
                        name: 'run server',
                        type: 'node',
                        request: 'launch',
                        preLaunchTask: 'build:model',
                        cwd: '${workspaceFolder}',
                        args: ['-r', '@ts-tools/node/r', '${workspaceFolder}/modules/server/src/dev.ts'],
                        internalConsoleOptions: 'openOnSessionStart',
                    },
                    {
                        // from https://github.com/angular/angular-cli/issues/2453#issuecomment-269055938
                        name: 'debug chrome',
                        type: 'chrome',
                        request: 'launch',
                        preLaunchTask: 'webpack: dev server',
                        url: 'http://localhost/',
                        sourceMaps: true,
                        trace: true,
                        webRoot: '${workspaceFolder}',
                        sourceMapPathOverrides: {
                            'webpack:///./*': '${webRoot}/*',
                        },
                    },
                    {
                        // from https://github.com/angular/angular-cli/issues/2453#issuecomment-269055938
                        name: 'attach to chrome',
                        type: 'chrome',
                        request: 'attach',
                        url: 'http://localhost:8080/gm.html',
                        port: 9222,
                        sourceMaps: true,
                        webRoot: '${workspaceFolder}',
                        sourceMapPathOverrides: {
                            'webpack:///./*': '${webRoot}/*',
                        },
                    },
                ]),
        },
        null,
        2
    );
}
