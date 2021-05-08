const baseConfig = {
    testEnvironment: 'node',
    transform: {
        '^.+\\.(ts|js|tsx|jsx)$': 'ts-jest',
    },
    moduleNameMapper: {
        '^@starwards/(.+)': '<rootDir>/modules/$1/src',
    },
};

module.exports = {
    globals: {
        'ts-jest': {
            diagnostics: {
                warnOnly: true,
            },
        },
    },
    projects: [
        {
            ...baseConfig,
            displayName: 'server',
            testRegex: 'modules/server/.*\\.spec\\.(ts|js|tsx|jsx)$',
        },
        {
            ...baseConfig,
            displayName: 'model',
            testRegex: 'modules/model/.*\\.spec\\.(ts|js|tsx|jsx)$',
        },
    ],
};
