const fs = require('fs');

const baseConfig = {
    testPathIgnorePatterns: ['/node_modules/', '/cjs/', '/dist/'],
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': [
            '@jgoz/jest-esbuild',
            {
                sourcemap: true,
                esbuild: {
                    platform: 'node',
                    target: 'node20',
                    tsconfigRaw: fs.readFileSync('./tsconfig.json', 'utf8'),
                },
            },
        ],
    },
    modulePathIgnorePatterns: ['<rootDir>/dist'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    moduleNameMapper: {
        '^@starwards/([a-zA-Z0-9$_-]+)$': '<rootDir>/modules/$1/src',
        '^@starwards/([a-zA-Z0-9$_-]+)/(.*)$': '<rootDir>/modules/$1/$2',
    },
};

module.exports = {
    projects: [
        {
            ...baseConfig,
            displayName: 'server',
            testRegex: 'modules/server/.*\\.spec\\.ts$',
        },
        {
            ...baseConfig,
            displayName: 'core',
            testRegex: 'modules/core/.*\\.spec\\.ts$',
        },
        {
            ...baseConfig,
            displayName: 'node-red',
            testRegex: 'modules/node-red/.*\\.spec\\.ts$',
        },
    ],
};
