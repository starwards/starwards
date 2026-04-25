import globals from 'globals';
import js from '@eslint/js';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// ---------------------------------------------------------------------------
// Inline `local` plugin: Starwards-specific invariant checks.
//
// Three rules, AST-only (no type-info), so they're cheap and run on every
// `npm run lint`. See docs/PATTERNS.md and CLAUDE.md for the invariants
// these rules encode.
// ---------------------------------------------------------------------------

const BANNED_DIRECT_FIELDS = new Set(['position', 'velocity', 'angle', 'turnSpeed']);

// Files allowed to write directly into `*.state.{banned}` because they ARE
// the source-of-truth managers / sync layer. movement-manager owns the
// reverse-sync of velocity/turnSpeed back into ship.state immediately
// after mutating the SpaceObject through SpaceManager.
const DIRECT_WRITE_ALLOWLIST = [
    /modules\/core\/src\/ship\/ship-manager-abstract\.ts$/,
    /modules\/core\/src\/ship\/ship-manager\.ts$/,
    /modules\/core\/src\/ship\/movement-manager\.ts$/,
    /modules\/core\/src\/space\/space-manager\.ts$/,
    /\.spec\.ts$/,
    /\.test\.ts$/,
    /\/test\//,
];

const localPlugin = {
    rules: {
        'no-direct-ship-state-write': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'Disallow direct writes to *.state.spaceship.{position,velocity,angle,turnSpeed,health}. ' +
                        'These are mirrored from the SpaceObject every tick by syncShipProperties; ' +
                        'writes to ship.state.spaceship.* are silently overwritten. Modify the SpaceObject instead.',
                },
                schema: [],
                messages: {
                    direct:
                        'Do not write directly to `*.state.spaceship.{{field}}`. ' +
                        'syncShipProperties overwrites it every tick. ' +
                        'Modify the SpaceObject in SpaceManager instead. ' +
                        'See `docs/PATTERNS.md` and the State Synchronization section of CLAUDE.md.',
                },
            },
            create(context) {
                const filename = context.filename || context.getFilename?.() || '';
                if (DIRECT_WRITE_ALLOWLIST.some((re) => re.test(filename))) {
                    return {};
                }

                /**
                 * Walk a MemberExpression and return the chain
                 * `[..., 'state', 'spaceship', 'angle']` style array of property names,
                 * or null if any segment is computed.
                 */
                function chain(node) {
                    const out = [];
                    let cur = node;
                    while (cur && cur.type === 'MemberExpression') {
                        if (cur.computed) return null;
                        if (cur.property.type !== 'Identifier') return null;
                        out.unshift(cur.property.name);
                        cur = cur.object;
                    }
                    return out;
                }

                return {
                    AssignmentExpression(node) {
                        if (node.left.type !== 'MemberExpression') return;
                        const props = chain(node.left);
                        if (!props || props.length < 3) return;

                        // Look for `.state.spaceship.<banned>` or `.state.spaceship.<banned>.x|.y`.
                        for (let i = 0; i < props.length - 2; i++) {
                            if (props[i] !== 'state' || props[i + 1] !== 'spaceship') continue;
                            const next = props[i + 2];
                            if (BANNED_DIRECT_FIELDS.has(next)) {
                                context.report({
                                    node,
                                    messageId: 'direct',
                                    data: { field: next },
                                });
                                return;
                            }
                        }
                    },
                };
            },
        },

        'gamefield-decorator-order': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        '`@gameField` must be the innermost decorator (declared LAST in source order, ' +
                        'closest to the property). Reordering silently breaks Colyseus type setup.',
                },
                schema: [],
                messages: {
                    notInnermost:
                        '`@gameField` must be the innermost decorator on this property ' +
                        '(declared LAST, closest to the property). See CLAUDE.md / PATTERNS.md.',
                },
            },
            create(context) {
                /**
                 * Returns the "name" of a decorator's expression for matching:
                 *  - `@foo` -> "foo"
                 *  - `@foo(...)` -> "foo"
                 *  - `@a.b` -> "b"
                 */
                function decoratorName(d) {
                    let expr = d.expression;
                    if (!expr) return null;
                    if (expr.type === 'CallExpression') expr = expr.callee;
                    if (expr.type === 'Identifier') return expr.name;
                    if (expr.type === 'MemberExpression' && expr.property.type === 'Identifier') {
                        return expr.property.name;
                    }
                    return null;
                }

                function check(node) {
                    const decorators = node.decorators;
                    if (!decorators || decorators.length < 2) return;

                    const names = decorators.map(decoratorName);
                    const gfIdx = names.findIndex((n) => n === 'gameField');
                    if (gfIdx === -1) return;

                    // Innermost = last in source order (TypeScript legacy
                    // decorators apply bottom-up; the LAST one runs first).
                    if (gfIdx !== decorators.length - 1) {
                        context.report({
                            node: decorators[gfIdx],
                            messageId: 'notInnermost',
                        });
                    }
                }

                return {
                    PropertyDefinition: check,
                    // Older parsers / variants may emit ClassProperty instead.
                    ClassProperty: check,
                };
            },
        },

        'no-bare-reflect-set-on-state': {
            meta: {
                type: 'problem',
                docs: {
                    description:
                        'In modules/core/src/json-ptr.ts, every `Reflect.set` on a Schema instance must ' +
                        'be guarded by an `isCommandable` check. Locks the @commandable whitelist in.',
                },
                schema: [],
                messages: {
                    bare:
                        '`Reflect.set` in json-ptr.ts is not guarded by an `isCommandable` check. ' +
                        'Any Schema write through this function MUST go through the @commandable ' +
                        'whitelist. See docs/json-ptr.md.',
                },
            },
            create(context) {
                const filename = context.filename || context.getFilename?.() || '';
                if (!/modules\/core\/src\/json-ptr\.ts$/.test(filename)) {
                    return {};
                }
                let sawIsCommandable = false;
                return {
                    Identifier(node) {
                        if (node.name === 'isCommandable') {
                            sawIsCommandable = true;
                        }
                    },
                    'CallExpression:exit'(node) {
                        const callee = node.callee;
                        if (
                            callee.type === 'MemberExpression' &&
                            callee.object.type === 'Identifier' &&
                            callee.object.name === 'Reflect' &&
                            callee.property.type === 'Identifier' &&
                            callee.property.name === 'set' &&
                            !sawIsCommandable
                        ) {
                            context.report({ node, messageId: 'bare' });
                        }
                    },
                };
            },
        },
    },
};

export default [
    // Global ignores
    {
        ignores: ['node_modules/**', '**/dist/**', '**/cjs/**', '**/*.typegen.ts'],
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
            local: localPlugin,
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
            // Starwards-specific invariant rules. See top of this file.
            'local/no-direct-ship-state-write': 'error',
            'local/gamefield-decorator-order': 'error',
            'local/no-bare-reflect-set-on-state': 'error',
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
