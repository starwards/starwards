# Crash Recovery & Reconnection

**Status:** Mostly working, gaps identified

## What works today

- **Server rooms persist** — all rooms have `autoDispose = false`. Ship state survives client disconnects.
- **Auto-reconnect** — XState connection manager retries on error (10ms interval).
- **Layout persistence** — golden-layout state saved to `localStorage` per layout name. Auto-saves on every state change.
- **Game save/load** — server endpoints `/save-game` and `/load-game` serialize full game state.
- **URL-based rejoining** — `ship.html?ship={shipId}&layout={layoutName}` gets a player back to their station.

## Scenario: browser crashes mid-event

1. Server keeps room alive, ship state intact
2. Player reopens browser, navigates to same URL
3. Layout restores from localStorage
4. Connection manager reconnects, syncs state from server
5. Player is back — may be 30+ seconds behind but catches up

**What they lose:** events that happened while offline, any in-flight commands.
**What they keep:** screen layout, ship state, game progress.

## Gaps to address before event

| Gap | Severity | Notes |
|-----|----------|-------|
| **No connection indicator** | High | Player doesn't know if game is reconnecting or dead. Need visible status. |
| **Infinite reload loop** | Medium | If ship deleted while offline, `location.reload()` loops forever. |
| **No reconnection UX** | Medium | No "reconnecting..." overlay or feedback during retry. |
| **Command loss** | Low | Acceptable — commands during disconnect are dropped, not queued. |

## Recommendations

1. Add a visible connection status indicator to all station screens (green dot / red dot / spinner)
2. Guard the `location.reload()` pattern against infinite loops (max retries or fallback to lobby)
3. Document the reconnection flow for GMs (how to help a player get back in)

## Key files

- `modules/core/src/client/connection-manager.ts` — XState reconnection state machine
- `modules/core/src/client/driver.ts` — WebSocket error/leave handlers
- `modules/browser/src/screens/ship.ts` — layout localStorage persistence
- `modules/server/src/admin/game-manager.ts` — save/load endpoints
