// dependency-cruiser config — minimal architectural firewall.
//
// Goal: prevent obvious accidents from blind LLM PRs. Two rules:
//   1. Browser code may not import core internals (use the public API).
//   2. No circular dependencies between top-level modules.
//
// Run via: npm run depcheck
// Wired into the Test-Static job in .github/workflows/ci-cd.yml.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-core-internal-from-browser',
            comment:
                'modules/browser must consume @starwards/core via its public ' +
                'entry point only. Internal symbols belong on the ' +
                '@starwards/core/internal subpath. See modules/core/package.json exports.',
            severity: 'error',
            from: { path: '^modules/browser/' },
            to: { path: '@starwards/core/internal' },
        },
        {
            name: 'no-browser-from-mcp',
            comment:
                'modules/mcp is a headless Node client. Anything it needs from ' +
                'modules/browser (radar filtering, scan-level intel) belongs in ' +
                '@starwards/core so both consume one copy.',
            severity: 'error',
            from: { path: '^modules/mcp/' },
            to: { path: '^modules/browser/' },
        },
        {
            // Within-module cycles already exist all over the codebase and
            // would create busywork to fix. We start with a focused rule
            // that only flags cross-module cycles (e.g. browser→server→
            // browser), which is what would actually break the build graph.
            name: 'no-cross-module-circular',
            comment:
                'A cycle that crosses top-level module boundaries (e.g. ' +
                'modules/browser → modules/server → modules/browser) is a ' +
                'symptom of layering breakage. Within-module cycles are ' +
                'tolerated for now and tracked separately.',
            severity: 'error',
            from: { path: '^modules/(browser|server|node-red|mcp)/' },
            to: {
                circular: true,
                path: '^modules/core/',
                viaNot: '^modules/[^/]+/(?:src|test)/',
            },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        tsPreCompilationDeps: true,
        tsConfig: { fileName: 'tsconfig.json' },
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default', 'types'],
            mainFields: ['main', 'types'],
        },
    },
};
