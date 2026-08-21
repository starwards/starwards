# Development Guide

## Setup

**Requirements:** Node.js ≥ 24.0.0, npm ≥ 10.9.0, Git

```bash
git clone https://github.com/starwards/starwards.git && cd starwards
npm ci                     # Install deps
npm run build              # Build all
npm test                   # Verify
```

## Build

| Command              | Purpose                     |
| -------------------- | --------------------------- |
| `npm run build`      | Build all modules           |
| `npm run build:core` | Core only                   |
| `npm run clean`      | Remove artifacts            |
| `npm run pkg`        | Native executable (Windows) |

**Build order:** core → (server, browser, node-red in parallel), orchestrated by [Turborepo](https://turbo.build) (`turbo.json`). Repeat builds with no changes hit the local cache and complete in well under a second; `npm run build:core` etc. bypass turbo and always build.

**Production build:**

```bash
npm run clean
npm ci
npm run build
npm run pkg      # → dist/exec/starwards-win.exe (targets in scripts/post-build.js)
```

**Outputs:**

- core: `modules/core/cjs/`
- server: `modules/server/cjs/`
- browser: `modules/browser/dist/`
- node-red: `modules/node-red/dist/`

## Development Workflow

**One command (cross-platform, via concurrently):**

```bash
npm run dev
# core watch + API server + webpack dev server in one terminal
# Zellij pane-grid variant: npm run dev:zellij
```

**Or 3 separate terminals:**

**Terminal 1: Core Watch**

```bash
cd modules/core && npm run build:watch
```

**Terminal 2: Webpack Dev Server**

```bash
cd modules/browser && npm start
# Serves http://localhost:3000
```

**Terminal 3: API Server**

```bash
node -r ts-node/register/transpile-only modules/server/src/dev.ts
# Runs on http://localhost:8080
```

**Hot reload:** Browser client auto-reloads | Server requires manual restart

**Surviving server restarts:** set `STARWARDS_RESTORE=1` on the dev server to persist the running game state to a local snapshot (gitignored, written every few seconds) and auto-restore it on boot — a restart lands back in the same scenario instead of an empty lobby. Delete the snapshot file (see `modules/server/src/snapshot/snapshot-persistence.ts` for the path, overridable via `STARWARDS_SNAPSHOT_FILE`) to start fresh. Dev-only: `prod.ts` is unaffected.

## Testing

Commands, harnesses, fixtures and troubleshooting all live in [testing/README.md](testing/README.md).

## Docker

**Services:** MQTT (1883), Node-RED (1880)

```bash
cd docker && docker-compose up -d     # Start
docker-compose logs -f [service]      # View logs
docker-compose down                    # Stop
```

## Debugging

### VSCode

- **Debug server:** F5 → "Run Server"
- **Debug tests:** F5 → "Test current file"

### Browser

- Chrome DevTools (F12), source maps enabled
- `console.log()` for client debugging

### Network

- Colyseus Monitor: http://localhost:8080/colyseus-monitor (admin/admin)
- WebSocket: Chrome DevTools → Network → WS

## Common Issues

| Issue                                   | Solution                                                                                                                                                                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webpack fails (Node 17+)                | `NODE_OPTIONS=--openssl-legacy-provider npm start`                                                                                                                                                                                                                    |
| Core changes not reflected              | Ensure `npm run build:watch` running                                                                                                                                                                                                                                  |
| Port in use                             | Dev server uses 8080 (override with `PORT`). Unix: `lsof -ti:8080 \| xargs kill -9`; Windows: `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process`                                                                                  |
| Type errors after update                | `npm run clean && npm ci && npm run build`                                                                                                                                                                                                                            |
| Webpack overlay shows `[object Object]` | **Known Issue:** Webpack dev server error overlay displays `[object Object]` instead of actual error message when errors are wrapped. Check browser console (F12) for the actual error message and stack trace. Enhanced logging is configured in `webpack.dev.js:42` |

## VSCode Config

**Extensions:** ESLint, Prettier, TypeScript

**Tasks (Ctrl+Shift+P → Tasks: Run Task):**

- `build core` - Core watch
- `build server` - Server watch
- `webpack: dev server` - Dev server

**Settings:** Auto-format on save, ESLint auto-fix (pre-configured in `.vscode/`)

## Node Requirements

**Node.js ≥ 24.0.0, npm ≥ 10.9.0**

**Check:** `node --version && npm --version`

## Path Aliases

`@starwards/*` → `modules/*/src` or `modules/*/cjs`

**Configured in:** `tsconfig.json`, `jest.config.js`, `webpack.common.js`

## Adding things

- A widget → [integration/extending-widgets.md](integration/extending-widgets.md)
- A ship system → [integration/extending-ship-systems.md](integration/extending-ship-systems.md)
- A space object → [integration/extending-space-objects.md](integration/extending-space-objects.md)
- A command → [specs/COMMAND_SYSTEM_SPEC.md](specs/COMMAND_SYSTEM_SPEC.md)

**Related:** [ARCHITECTURE.md](ARCHITECTURE.md) | [PATTERNS.md](PATTERNS.md) | [testing/README.md](testing/README.md)
