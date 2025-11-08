import globals from 'globals';
import js from '@eslint/js';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
    // Global ignores
    {
        ignores: ['node_modules/**', '**/dist/**', '**/cjs/**', '**/*.typegen.ts'],
    },
    // ESLint config file - disable sort-imports
    {
        files: ['eslint.config.mjs'],
        rules: {
            'sort-imports': 'off',
        },
    },
    // Base config for all files
    {
        files: ['**/*.{js,jsx,mjs,cjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
        },
        plugins: {
            react,
            'react-hooks': reactHooks,
            'no-only-tests': noOnlyTests,
            prettier: prettierPlugin,
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            ...react.configs.recommended.rules,
            'no-shadow': 'error',
            'sort-imports': 'error',
            'no-only-tests/no-only-tests': 'error',
            'no-console': 'error',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
            'react/prop-types': 'off',
            'prettier/prettier': 'error',
            ...prettierConfig.rules,
        },
    },
    // TypeScript config
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: './tsconfig.json',
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
                // TypeScript globals
                JQuery: 'readonly',
                mmk: 'readonly',
                EventEmitter: 'readonly',
                Component: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            react,
            'react-hooks': reactHooks,
            'no-only-tests': noOnlyTests,
            prettier: prettierPlugin,
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            ...js.configs.recommended.rules,
            ...react.configs.recommended.rules,
            ...tseslint.configs.recommended.rules,
            ...tseslint.configs['recommended-type-checked'].rules,
            'no-shadow': 'off',
            'no-redeclare': 'off',
            'sort-imports': 'error',
            'no-only-tests/no-only-tests': 'error',
            'no-console': 'error',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
            'react/prop-types': 'off',
            'prettier/prettier': 'error',
            '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
            '@typescript-eslint/no-shadow': 'error',
            '@typescript-eslint/no-redeclare': 'off', // Allow same name for types and values
            '@typescript-eslint/no-unused-expressions': [
                'error',
                {
                    allowShortCircuit: true, // Allow a && b()
                    allowTernary: true, // Allow a ? b() : c()
                    allowTaggedTemplates: true,
                },
            ],
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
                    functions: 'always-multiline',
                },
            ],
            'init-declarations': 'off',
            '@typescript-eslint/init-declarations': 'off',
            ...prettierConfig.rules,
        },
    },
    // Test files config
    {
        files: [
            '**/*.spec.{ts,tsx,js,jsx}',
            '**/*.test.{ts,tsx,js,jsx}',
            '**/test/**/*.{ts,tsx,js,jsx}',
            '**/src/test/**/*.{ts,tsx,js,jsx}',
            '**/*-driver.ts',
            '**/test-*.ts',
        ],
        languageOptions: {
            globals: {
                ...globals.jest,
            },
        },
    },
];
