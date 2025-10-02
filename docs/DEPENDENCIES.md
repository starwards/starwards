# Dependencies

## Core Framework

| Package | Version | Rationale |
|---------|---------|-----------|
| colyseus | ^0.15.15 | Stable, mature state sync (0.16.x has breaking changes) |
| @colyseus/schema | ^2.0.30 | Compatible with TS strict mode |
| colyseus.js | ^0.15.18 | Must match server version |
| @colyseus/ws-transport | ^0.15.0 | Stable WebSocket |

## State & Logic

| Package | Version | Rationale |
|---------|---------|-----------|
| xstate | ^5.9.1 | Modern TS support, v5.x migration complete |
| detect-collisions | ^9.5.3 | Spatial hashing, O(n log n) avg |
| json-ptr | ^3.1.1 | RFC 6901 compliant, zero deps |

## Browser

| Package | Version | Rationale |
|---------|---------|-----------|
| pixi.js | ^7.1.2 | Stable, WebGL 2 (v8.x has breaking changes) |
| react | ^17.0.2 | Stable, Arwes compatible (v18 needs testing) |
| react-dom | ^17.0.2 | Matches React version |
| golden-layout | ^1.5.9 | **PINNED** (v2.x complete rewrite, incompatible) |
| @arwes/core | 1.0.0-alpha.19 | **ALPHA** (only version w/ React support) |

## Development

| Package | Version | Rationale |
|---------|---------|-----------|
| typescript | ~5.4.3 | Modern features, strict mode |
| webpack | ^5.91.0 | Stable, HMR |
| webpack-dev-server | ^5.0.4 | Matches Webpack |
| tsup | ^8.0.2 | Fast library builds |
| jest | ^29.7.0 | Stable, fast w/ esbuild |
| @playwright/test | ^1.42.1 | E2E testing |

## Version Pins

**Caret (^):** Allow minor/patch updates
- `^0.15.15` → 0.15.16+ OK, 0.16.0+ NO

**Tilde (~):** Allow patch updates only
- `~5.4.3` → 5.4.4+ OK, 5.5.0+ NO

**Exact:** No updates
- `1.0.0-alpha.19` → Exactly this version

## Known Issues

| Package | Version | Issue | Status |
|---------|---------|-------|--------|
| colyseus | 0.16.x | Breaking room lifecycle changes | Monitoring |
| @colyseus/schema | 2.1.x | Deprecations introduced | Monitoring |
| pixi.js | 8.x | Breaking renderer API | Monitoring |
| golden-layout | 2.x | Complete rewrite, incompatible | **NO UPGRADE** |
| @arwes/core | alpha | API may change before 1.0 | Monitoring |

## Upgrade Checklist

**Before upgrading:**
1. Check changelog: `npm info <package> versions`
2. Test locally: `npm install <package>@<version> && npm test`
3. Monitor key areas (below)

**Colyseus:**
- [ ] Room creation/destruction
- [ ] State sync (multi-client tests)
- [ ] Reconnection
- [ ] JSON Pointer commands
- [ ] Performance (>10 ships)

**PixiJS:**
- [ ] Visual effects render
- [ ] Performance
- [ ] E2E snapshots
- [ ] Memory leaks

**React:**
- [ ] All widgets functional
- [ ] Golden Layout compatibility
- [ ] Arwes components
- [ ] No console errors

**Physics:**
- [ ] Collision accuracy
- [ ] No tunneling
- [ ] Performance (>100 objects)

## Security

```bash
npm audit                # Check vulnerabilities
npm audit fix            # Safe updates
npm audit fix --force    # Breaking updates (careful!)
```

**Strategy:** Security patches immediate | Minor monthly | Major quarterly

**Related:** [DEVELOPMENT.md](DEVELOPMENT.md) | [ARCHITECTURE.md](ARCHITECTURE.md)
