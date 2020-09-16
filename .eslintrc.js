module.exports = {
    env: {
        browser: true,
        es6: true,
        node: true,
    },
    extends: ['eslint:recommended', 'plugin:react/recommended', 'prettier', 'prettier/react'],
    parser: '@typescript-eslint/parser',
    plugins: ['react-hooks', 'no-only-tests', 'prettier'],
    settings: {
        react: {
            version: 'detect',
        },
    },

    rules: {
        'no-only-tests/no-only-tests': 'error',
        'no-console': 'error',
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'react/prop-types': 'off',
        'prettier/prettier': 'error',
    },
    overrides: [
        {
            files: ['*.ts', '*.tsx'],
            parserOptions: {
                project: './tsconfig.json',
            },
            extends: [
                'plugin:@typescript-eslint/recommended',
                'plugin:@typescript-eslint/recommended-requiring-type-checking',
                'prettier/@typescript-eslint',
            ],
            rules: {
                '@typescript-eslint/explicit-module-boundary-types': 'off',
                '@typescript-eslint/no-use-before-define': 'off',
                '@typescript-eslint/no-unused-vars': 'off',
            },
        },
    ],
};
