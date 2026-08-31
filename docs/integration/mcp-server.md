---
audience: both
depth: deep
source_of_truth:
  - modules/mcp
  - modules/core/src/stations-manifest.ts
  - modules/server/src/stations-manifest.ts
  - modules/mcp/src/radar/radar-view.spec.ts
  - modules/mcp/src/testplay.spec.ts
related:
  - INTEGRATION.md
  - maintainers.md
last_verified: 2026-08-18
---

# MCP Server (LLM stations)

**Module:** [`modules/mcp`](../../modules/mcp) — an MCP server that lets an LLM crew a station.

## Overview

Node-RED connects to the game as a machine: any pointer, read or written, no notion of who is asking.
An LLM crewing a bridge needs the opposite — it should sit at one station and be bounded by it, or it
plays with information no player at that seat could have. So the MCP server sandboxes each session to
a station: the widgets that station's screen draws are what it can read, the input actions that screen
wires are what it can do, and its radar is filtered exactly as the browser filters it.

The game server enforces none of this and is not meant to (see [`maintainers.md`](../maintainers.md),
"Non-goal: malicious-player isolation"). The sandbox lives in the MCP server.

## Setup

The server talks stdio, so an MCP client launches it:

```json
{
    "mcpServers": {
        "starwards": {
            "command": "npx",
            "args": ["-y", "@starwards/mcp", "--url", "http://localhost:8080"]
        }
    }
}
```

`--url` (or `STARWARDS_URL`) points at the game server; it defaults to `http://localhost:8080`. A bare
`host:port` is accepted.

## Stations come from the server

The bridge layout is not client configuration — it is served, so the browser client, the MCP server and
anything else agree on one definition:

```
GET /stations-manifest/:shipId
```

The manifest is `{ stations: { <name>: StationEntry } }`, defined in
[`modules/core/src/stations-manifest.ts`](../../modules/core/src/stations-manifest.ts) and populated in
[`modules/server/src/stations-manifest.ts`](../../modules/server/src/stations-manifest.ts). Each entry:

| Field      | Meaning                                                                             |
| ---------- | ----------------------------------------------------------------------------------- |
| `enabled`  | A station is selectable only when explicitly enabled.                               |
| `widgets`  | Panels this seat may read — one flag per widget the station screen draws.            |
| `commands` | Controls this seat may operate — one flag per input action the station screen wires. |
| `prompt`   | The briefing handed to an LLM taking this seat.                                      |
| `gm`       | Game master: sees all of space at full scan level, may tweak anything.               |

Everything is deny-by-default: `"Johnny": { "enabled": true }` is a valid station that can see nothing
and do nothing. Station names are free-form. The `gm` seat ships disabled.

View-state actions — zoom, pan, follow, client-local target cycling — have no flags. They change
nothing another client can observe, and an LLM always reads the full scope its widgets admit.

Per-ship bridges are the seam this leaves open: `getStationsManifest(shipId)` takes the ship, and today
returns the same bridge for every one.

## Tools

| Tool                  | Purpose                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `list_ships`          | Ships in the running game.                                                    |
| `list_stations`       | Stations a ship offers, with flags and briefings.                             |
| `login`               | Take a seat. Everything afterwards is bounded by it.                          |
| `logout`              | Leave the seat.                                                               |
| `get_capabilities`    | What this seat may read and do, with live value ranges and indices.           |
| `get_ship_status`     | Read one panel the seat holds.                                                |
| `get_radar_contacts`  | The seat's picture of space, filtered and scan-level degraded.                |
| `execute_command`     | Operate a control the seat holds.                                             |
| `say`                 | Speak to the rest of the crew.                                                |
| `listen`              | Hear what the crew has said since the last call.                              |

A refusal names what the seat can do instead, so a model can correct itself without guessing.

## Radar filtering

All space state is broadcast to every client; what a station sees is a filter the client applies. The
MCP server reproduces it from the same core `FieldOfView` over the same synced `radarSectors`, so
sector range, arc, the minimum-detectable-size gate and line-of-sight occlusion all apply, and a
contact is visible when any same-faction ship holds it — the fleet shares one picture. Scan level then
degrades detail without hiding contacts: below `BASIC` a contact reports position and size only, never
its type, faction or name.

`modules/mcp/src/radar/radar-view.spec.ts` asserts this against the browser's predicate directly.

## The crew channel

A sandboxed station is a station that cannot see most of the ship, which is the point: signals is the
only seat that can identify a blip, the engineer the only seat that knows why power is sagging. The game only
works when those seats tell each other, so `say` and `listen` carry crew speech over a Discord text
channel — the one the human crew already uses, which makes an LLM station and a human player the same
kind of participant in the same room. A testplay can be all-LLM, all-human, or mixed.

Configure it through the environment of each MCP server process — a bot token does not belong in a
committed client config, so there is no flag form:

| Variable               | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `DISCORD_WEBHOOK_URL`  | Where speech is posted. Each message overrides the webhook username with the   |
|                        | speaking station's name, so one webhook serves the whole crew.                 |
| `DISCORD_BOT_TOKEN`    | Reading needs a bot, with the **Message Content intent** enabled.              |
| `DISCORD_CHANNEL_ID`   | The channel to read.                                                           |
| `STARWARDS_CALLSIGN`   | What to call yourself before you hold a seat. A captain never logs in.         |

Neither tool consults the manifest: speech is not a station capability. Unset variables produce a
refusal naming them, and the server otherwise runs exactly as it does without a channel.

The channel is outside the game — nothing said there is subject to range, jamming or a damaged comms
array, and a station hears an order only when it next calls `listen`. Humans must type; a voice
channel is inaudible to the models.

## Running a testplay

1. `npm run dev` — game on `localhost:8080`. Open a browser GM screen: it is the only honest check on
   what the crew is actually doing, as opposed to what it tells each other.
2. `npm run build:mcp`.
3. One Discord text channel, a webhook on it, and a bot in the guild with Message Content on.
4. One MCP client session per station, all pointed at the same game and the same channel, each told
   which seat to take: `pilot`, `weapons`, `engineer`, `signals`, `relay`. The seat's
   briefing comes back from `login` — that is what the manifest's `prompt` is for.
5. A captain: either a human typing in the channel, or a session that never calls `login` and so has
   only `say` and `listen` — a fair model of an officer who commands through the crew.

Start with two seats, not six. Have signals `say` a contact it has identified, confirm the pilot's
`listen` returns it, and confirm the pilot's own `get_radar_contacts` still reports that contact as
`UFO`: the crew shares knowledge, the sandbox does not.

`modules/mcp/src/testplay.spec.ts` runs that loop without any model in it — three stations, three MCP
sessions, one running game — so the seams a crew depends on stay covered by CI. The crew there is
scripted: a real-LLM run is a thing you watch, not a thing you assert on.
