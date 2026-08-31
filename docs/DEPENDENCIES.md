---
audience: both
depth: deep
source_of_truth:
  - package.json
  - modules/core/package.json
  - modules/browser/package.json
related:
last_verified: 2026-07-04
---

# Dependencies

## Core Framework

| Package | Version | Rationale |
|---------|---------|-----------|
| @colyseus/core | ^0.16.23 | Server framework (0.16.x line adopted) |
| @colyseus/schema | ^3.0.76 | Compatible with TS strict mode |
| colyseus.js | ^0.16.22 | Must match server version |
| @colyseus/ws-transport | ^0.16.5 | Stable WebSocket |

## State & Logic

| Package | Version | Rationale |
|---------|---------|-----------|
| xstate | ^5.32.4 | Modern TS support, v5.x migration complete |
| detect-collisions | ^10.10.2025 | Spatial hashing, O(n log n) avg |

## Browser

| Package | Version | Rationale |
|---------|---------|-----------|
| pixi.js | ^8.19.0 | Stable, WebGL 2 (upgraded from v7) |
| react | ^18.3.1 | React 18 in use, Arwes (@arwes/react) compatible |
| react-dom | ^18.3.1 | Matches React version |
| golden-layout | ^1.5.9 | **PINNED** (v2.x complete rewrite, incompatible) |
| @arwes/react | 1.0.0-next.25020502 | Sci-fi UI framework (next pre-release) |

## Development

| Package | Version | Rationale |
|---------|---------|-----------|
| typescript | ^6.0.3 | TS 6 (explicit `types` lists — no auto typeRoots inclusion; `ignoreDeprecations: "6.0"` for node10 resolution until module-resolution migration) |
| webpack | ^5.108.3 | Stable, HMR |
| webpack-dev-server | ^5.2.6 | Matches Webpack |
| tsup | ^8.5.1 | Fast library builds |
| jest | ^30.4.2 | Stable, fast w/ esbuild |
| @playwright/test | ^1.61.1 | E2E testing (e2e Dockerfile image tag must match) |
| turbo | ^2.10.3 | Build task graph + local caching (core → rest ordering; requires `packageManager` field in root package.json) |

## Version Pins

**Caret (^):** Allow minor/patch updates
- `^0.15.15` → 0.15.16+ OK, 0.16.0+ NO

**Tilde (~):** Allow patch updates only
- `~5.4.3` → 5.4.4+ OK, 5.5.0+ NO

**Exact:** No updates
- `1.0.0-next.25020502` → Exactly this version

**zod must resolve to exactly one copy** — root `overrides` pins it (`4.1.12`), and `modules/mcp`
depends on that same exact version. zod v4 brands its schema types, so two copies in the tree are two
incompatible type identities. When `@modelcontextprotocol/sdk` and `modules/mcp` each resolved their
own, `tsc` did not report a mismatch — it exhausted a 4 GB heap trying to compare them, on a build
that had been fine moments earlier. Any module that adds zod must land on the same copy; check with
`npm ls zod --all` and confirm no `modules/*/node_modules/zod` exists.

**`@colyseus/core` is held at `0.16.24`** via root `overrides`. `0.16.25` was published with an
unresolved pnpm workspace specifier in its manifest — `"@colyseus/greeting-banner": "workspace:^"` —
which npm cannot resolve. Root `npm ci` is unaffected because the lockfile pins the resolution, but
every lockfile-free install fails with `EUNSUPPORTEDPROTOCOL`: `scripts/pkg.js` (the `npm run pkg`
step that produces `starwards.exe`) and the Dockerfile's `cd dist && npm install --omit=dev`. Lift
the pin once upstream republishes a fixed manifest.

Note that npm will keep reinstalling a nested copy while `package-lock.json` still has an entry for
it, even after the override is added — delete the `modules/*/node_modules/zod` entry from the lockfile
and reinstall.

## Docker Infrastructure

| Component | Version | Rationale |
|-----------|---------|-----------|
| open-stage-control | **1.30.4** (exact) | Not on npm; downloaded as `_node.zip` in `docker/osc/Dockerfile`. Pin via `ARG OSC_VERSION` in that file. Not available via Docker Hub image. |
| eclipse-mosquitto | **1.6.10** (exact) | MQTT broker (port 1883). Image tag pinned in `docker/docker-compose.yml`. |
| nodered/node-red | **3.0.2** (exact) | Node-RED runtime (port 1880). Image tag pinned in `docker/docker-compose.yml`. |

## Known Issues

| Package | Version | Issue | Status |
|---------|---------|-------|--------|
| golden-layout | 2.x | Complete rewrite, incompatible | **NO UPGRADE** |
| @arwes/react | 1.0.0-next (pre-release) | API may change before 1.0 | Monitoring |
| eslint | 10.x | eslint-plugin-react peers cap at ^9.7 | Blocked on plugin |
| colyseus | 0.17/0.18 | Breaking 0.x line (0.16.x adopted) | Dedicated migration |
| esbuild | 0.26+ | Breaking 0.x minors | Held at 0.25.x |
| @colyseus/core | 0.16.25 | Published with `workspace:^` in its manifest; breaks every lockfile-free `npm install` | Pinned to 0.16.24 via root `overrides` |
| zod | any second copy | Duplicate copies make `tsc` OOM rather than error (see Version Pins) | Pinned via root `overrides` |

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
