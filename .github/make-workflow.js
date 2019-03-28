#!/usr/bin/env node


var fs = require('fs');
var path = require('path');

const moduleNames = fs.readdirSync(path.resolve(__dirname, '..', 'modules'), {withFileTypes:true}).filter(n => n.isDirectory()).map(n => n.name);

fs.writeFileSync(path.join(__dirname, 'main.workflow'), repoScript(moduleNames));

function repoScript(moduleNames) {
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