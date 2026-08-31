# Build tooling and code quality

Techniques in the repo itself rather than the game — build orchestration, lint rules, hooks, and how configuration and assets are handled.

## Build System & Tooling

1. **Monorepo with Shared Path Mapping**
    - [`@starwards/*`](../../tsconfig.json) aliases to module locations
    - Import from source or compiled output
    - Independent module build systems
    - Core published to npm; others private

2. **Multiple Build Outputs**
    - Tsup for CommonJS library output
    - Webpack for browser bundles
    - Rollup for Node-RED editor
    - TypeScript compilation for server

3. **Concurrent Build Scripts**
    - [`concurrently`](../../package.json) runs multiple builds
    - `--kill-others-on-fail` stops all on error
    - Color-coded output per module
    - Parallel compilation

4. **Incremental TypeScript Compilation**
    - [`incremental: true`](../../tsconfig.json) in tsconfig
    - `.tsbuildinfo` file caching
    - Faster subsequent builds
    - Dependency tracking

5. **Source Maps for Debugging**
    - [`sourceMap: true`](../../tsconfig.json) in tsconfig
    - `.map` files for browser debugging
    - Original TypeScript in dev tools
    - Production debugging capability

6. **Path Alias Resolution**
    - [`paths`](../../tsconfig.json) in tsconfig
    - [`baseUrl: "."`](../../tsconfig.json) for relative resolution
    - Module imports without `../..`
    - Better refactoring support

## Code Quality & Linting

7. **No Console.log in Production**
    - ESLint [`'no-console': 'error'`](../../eslint.config.mjs)
    - Explicit `// eslint-disable-next-line` required
    - Prevents debug output leaks
    - Enforces proper logging

8. **Sort Imports Rule**
    - ESLint [`'sort-imports': 'error'`](../../eslint.config.mjs)
    - Alphabetically sorted imports
    - Consistent code style
    - Easier merge conflicts

9. **No Shadow Variables**
    - [`'@typescript-eslint/no-shadow': 'error'`](../../eslint.config.mjs)
    - Prevents variable name reuse
    - Reduces confusion
    - Catches common bugs

10. **No Only Tests**
    - [`'no-only-tests/no-only-tests': 'error'`](../../eslint.config.mjs)
    - Prevents `.only` in test commits
    - Ensures full test suite runs
    - CI/CD safety

11. **Prettier Integration**
    - [`'prettier/prettier': 'error'`](../../eslint.config.mjs)
    - Formatting as lint error
    - Consistent code style
    - Auto-fix on save

12. **Trailing Comma Enforcement**
    - [`'comma-dangle': ['error', 'always-multiline']`](../../eslint.config.mjs)
    - Cleaner git diffs
    - Easier array/object additions
    - Consistent style

13. **React Hooks Validation**
    - [`'react-hooks/rules-of-hooks': 'error'`](../../eslint.config.mjs)
    - [`'react-hooks/exhaustive-deps': 'error'`](../../eslint.config.mjs)
    - Prevents hook violations
    - Dependency array validation

14. **TypeScript Strict Mode**
    - [`strict: true`](../../tsconfig.json)
    - [`noImplicitReturns`](../../tsconfig.json)
    - [`noUnusedLocals`](../../tsconfig.json)
    - [`noFallthroughCasesInSwitch`](../../tsconfig.json)

## Git Workflow & Hooks

15. **Husky Git Hooks**
    - Pre-commit hooks in `.husky/`
    - Automatic setup after install
    - Enforces code quality
    - Prevents bad commits

16. **Lint-Staged Pre-commit**
    - [`lint-staged`](../../package.json) runs on staged files only
    - Prettier formatting
    - ESLint with auto-fix
    - Fast pre-commit checks

17. **Pretty-Quick for Speed**
    - [`pretty-quick`](../../package.json) formats only changed files
    - Faster than full project format
    - Git-aware file selection
    - Pre-commit optimization

## Configuration & Asset Management

18. **Copyfiles for Assets**
    - [`copyfiles`](../../package.json) script
    - Icon and asset copying
    - Build artifact management
    - Multi-stage builds
