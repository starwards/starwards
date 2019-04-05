#!/usr/bin/env node


var fs = require('fs');
var path = require('path');
var rootPath = path.resolve(__dirname, '..');

const moduleNames = fs.readdirSync(path.resolve(rootPath, 'modules'), {withFileTypes:true}).filter(n => n.isDirectory()).map(n => n.name);

fs.writeFileSync(path.join(rootPath, '.github', 'main.workflow'), mainWorkflow(moduleNames));

function mainWorkflow(moduleNames) {

    function moduleScript(moduleName) {
        return `
    action "Lint_${moduleName}" {
        needs = "Install"
        uses = "amir-arad/actions-yarn@master"
        args = "workspace @starwards/${moduleName} lint"
    }

    action "Test_${moduleName}" {
        needs = "Install"
        uses = "amir-arad/actions-yarn@master"
        args = "workspace @starwards/${moduleName} test"
    }
    `;
    }

    return `
    workflow "Build, Lint and Test" {
        on = "push"
        resolves = [${moduleNames.map(moduleName => `"Lint_${moduleName}", "Test_${moduleName}"`)}]
    }

    action "Install" {
        uses = "amir-arad/actions-yarn@master"
        args = "install"
    }
    ${moduleNames.map(moduleScript).join('')}
    `;
}


fs.writeFileSync(path.join(rootPath, '.vscode', 'launch.json'), launchJson(moduleNames));

function launchJson(moduleNames) {
    return JSON.stringify({
        "version": "0.2.0",
        "configurations": 
        moduleNames.map(moduleName => ({
            "type": "node",
            "request": "launch",
            "name": moduleName+" Mocha Tests",
            "program": "${workspaceFolder}/node_modules/mocha/bin/_mocha",
            "cwd": "${workspaceFolder}/modules/"+moduleName,
            "args": [
                "-r",
                "@ts-tools/node/r",
                "--timeout",
                "999999",
                "--colors",
                "${workspaceFolder}/modules/"+moduleName+"/test/**/**.spec.ts"
            ],
            "internalConsoleOptions": "openOnSessionStart"
        })).concat([{
            "type": "node",
            "request": "launch",
            "name": "Mocha Current",
            "program": "${workspaceFolder}/node_modules/mocha/bin/_mocha",
            "args": [
                "-r",
                "@ts-tools/node/r",
                "--timeout",
                "999999",
                "--colors",
                "${file}"
            ],
            "internalConsoleOptions": "openOnSessionStart"
        }])
    }, null, 2)
}
