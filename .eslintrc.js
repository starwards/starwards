module.exports = {
    env: {
        browser: true,
        es6: true,
        node: true,
    },
    extends: ['eslint:recommended', 'plugin:react/recommended', 'prettier'],
    parser: '@typescript-eslint/parser',
    plugins: ['react-hooks', 'no-only-tests', 'prettier'],
    settings: {
        react: {
            version: 'detect',
        },
    },

    rules: {
        'no-shadow': 'error',
        'sort-imports': 'error',
        'no-only-tests/no-only-tests': 'error',
        'no-console': 'error',
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'react/prop-types': 'off',
        'prettier/prettier': 'error',
        'init-declarations': ['error', 'always'],
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
                'prettier',
            ],
            rules: {
                'no-shadow': 'off',
                '@typescript-eslint/no-shadow': 'error',
                '@typescript-eslint/explicit-module-boundary-types': 'off',
                '@typescript-eslint/no-use-before-define': 'off',
                '@typescript-eslint/no-unused-vars': 'off',
                'comma-dangle': [
                    'error',
                    {
                        arrays: 'always-multiline',
                        objects: 'always-multiline',
                        imports: 'always-multiline',
                        exports: 'always-multiline',
                        functions: 'never',
                    },
                ],
            },
        },
    ],
};
