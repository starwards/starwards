# Integration Guide - Starwards

**External integrations and custom extensions**

## Table of Contents

- [Node-RED Integration](#node-red-integration)
- [MCP Server (LLM stations)](#mcp-server-llm-stations)
- [Docker Deployment](#docker-deployment)
- [Touch Controllers (Open Stage Control)](#touch-controllers-open-stage-control)
- [MQTT Integration](#mqtt-integration)
- [Custom Widget Creation](#custom-widget-creation)
- [New Ship System Creation](#new-ship-system-creation)
- [Custom Space Objects](#custom-space-objects)

## Node-RED Integration

### Overview

Node-RED integration enables external control and monitoring of Starwards via visual programming flows.

**Use Cases:**

- Hardware integration (DMX lights, sound systems)
- Dashboard creation
- MQTT bridging
- Custom automation
- External displays

### Installation

**Install Node-RED:**

```bash
npm install -g node-red
```

**Install Starwards nodes:**

```bash
cd ~/.node-red
npm install @starwards/node-red
```

**Start Node-RED:**

```bash
node-red
```

**Access:** http://localhost:1880

### Available Nodes

#### starwards-config

**Purpose:** Connection configuration (shared across ship nodes)

**Configuration:**

- Server URL (e.g., `http://localhost:8080`)
- Ship ID

**Usage:**

1. Drag `starwards-config` to flow
2. Double-click to configure
3. Enter server URL and ship ID
4. Other nodes reference this config

#### ship-read

**Purpose:** Read ship state properties

**Configuration:**

- Config: Select starwards-config node
- Pattern: JSON Pointer pattern (e.g., `/reactor/energy`)

**Output:**

```javascript
{
    topic: "/reactor/energy",  // JSON Pointer path
    payload: 1000              // Current value
}
```

**Example Flow:**

```
[ship-read] → [debug]
```

**Pattern Matching:**

```
/reactor/energy          // Specific property
/reactor/*               // All reactor properties
/thrusters/*/active      // All thruster active states
```

#### ship-write

**Purpose:** Write ship state properties

**Configuration:**

- Config: Select starwards-config node

**⚠️ Whitelist:** Node-RED writes go through the same JSON Pointer
admission check as browser clients. Only `@commandable`, `@tweakable`,
or `DesignState` fields may be written. Writes to unannotated fields
throw and are logged by `ShipRoom`. See `docs/json-ptr.md` for the full
admission rules. When in doubt, check whether the target field carries
`@tweakable` (most GM-facing fields do).

**Input:**

```javascript
{
    topic: "/reactor/power",   // JSON Pointer path (must be admitted)
    payload: 0.5               // New value
}
```

**Example Flow:**

```
[inject] → [ship-write]
```

### Example Flows

#### Example 1: Energy Monitor

**Flow:**

```
[ship-read: /reactor/energy] → [gauge] → [dashboard]
```

**Configuration:**

1. Add `ship-read` node
2. Set pattern: `/reactor/energy`
3. Add gauge widget
4. Connect to dashboard

#### Example 2: Power Control

**Flow:**

```
[slider: 0-1] → [ship-write: /reactor/power]
```

**Configuration:**

1. Add slider (0-1 range)
2. Add `ship-write` node
3. Set topic in function node:

```javascript
msg.topic = '/reactor/power';
return msg;
```

#### Example 3: Alert System

**Flow:**

```
[ship-read: /armor/health] → [switch: <20] → [mqtt out: alerts/low-health]
```

**Configuration:**

1. Monitor armor health
2. Switch node: route if < 20
3. Publish to MQTT alert topic

#### Example 4: Multi-Ship Dashboard

**Flow:**

```
[ship-read: ship-1] → [dashboard: Ship 1]
[ship-read: ship-2] → [dashboard: Ship 2]
```

**Configuration:**

1. Create multiple config nodes (one per ship)
2. Create separate read nodes
3. Display on dashboard

### Connection Management

**Driver Lifecycle:**

```
Config Node Created
    ↓
Driver Initialized
    ↓
WebSocket Connection
    ↓
Room Join
    ↓
State Sync
    ↓
[Active - Nodes Operational]
    ↓
Disconnect/Error
    ↓
Auto-Reconnect (exponential backoff)
```

**Status Indicators:**

- 🟢 Green: Connected
- 🟡 Yellow: Connecting
- 🔴 Red: Disconnected/Error

### Error Handling

**Common Issues:**

**Connection Failed:**

```
Error: ECONNREFUSED
```

- Solution: Verify server is running
- Check server URL in config

**Invalid Ship ID:**

```
Error: Ship not found
```

- Solution: Verify ship exists in game
- Check ship ID spelling

**Invalid Path:**

```
Error: Invalid JSON Pointer
```

- Solution: Check path syntax
- Use `/property` format

### Advanced Usage

**Custom Processing:**

```javascript
// Function node
const energy = msg.payload;
const percentage = (energy / 1000) * 100;
msg.payload = percentage;
return msg;
```

**Conditional Logic:**

```javascript
// Switch node
if (msg.payload < 20) {
    return [msg, null]; // Route 1: Low
} else {
    return [null, msg]; // Route 2: Normal
}
```

**Aggregation:**

```javascript
// Join node
// Combine multiple ship states
const ships = msg.payload;
const totalEnergy = ships.reduce((sum, ship) => sum + ship.reactor.energy, 0);
msg.payload = totalEnergy;
return msg;
```

## MCP Server (LLM stations)

**Module:** [`modules/mcp`](../modules/mcp) — an MCP server that lets an LLM crew a station.

### Overview

Node-RED connects to the game as a machine: any pointer, read or written, no notion of who is asking.
An LLM crewing a bridge needs the opposite — it should sit at one station and be bounded by it, or it
plays with information no player at that seat could have. So the MCP server sandboxes each session to
a station: the widgets that station's screen draws are what it can read, the input actions that screen
wires are what it can do, and its radar is filtered exactly as the browser filters it.

The game server enforces none of this and is not meant to (see [`maintainers.md`](maintainers.md),
"Non-goal: malicious-player isolation"). The sandbox lives in the MCP server.

### Setup

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

### Stations come from the server

The bridge layout is not client configuration — it is served, so the browser client, the MCP server and
anything else agree on one definition:

```
GET /stations-manifest/:shipId
```

The manifest is `{ stations: { <name>: StationEntry } }`, defined in
[`modules/core/src/stations-manifest.ts`](../modules/core/src/stations-manifest.ts) and populated in
[`modules/server/src/stations-manifest.ts`](../modules/server/src/stations-manifest.ts). Each entry:

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

### Tools

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

### Radar filtering

All space state is broadcast to every client; what a station sees is a filter the client applies. The
MCP server reproduces it from the same core `FieldOfView` over the same synced `radarSectors`, so
sector range, arc, the minimum-detectable-size gate and line-of-sight occlusion all apply, and a
contact is visible when any same-faction ship holds it — the fleet shares one picture. Scan level then
degrades detail without hiding contacts: below `BASIC` a contact reports position and size only, never
its type, faction or name.

`modules/mcp/src/radar/radar-view.spec.ts` asserts this against the browser's predicate directly.

### The crew channel

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

### Running a testplay

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

## Docker Deployment

### Docker Compose Setup

**File:** [`docker/docker-compose.yml`](../docker/docker-compose.yml)

```yaml
# mirrors: docker/docker-compose.yml
version: '3.9'

services:
    mqtt:
        image: eclipse-mosquitto:1.6.10
        ports:
            - '1883:1883'
        volumes:
            - ./mqtt/config:/mosquitto/config
            - ./mqtt/data:/mosquitto/data
            - ./mqtt/log:/mosquitto/log

    node-red:
        image: nodered/node-red:3.0.2
        ports:
            - '1880:1880'
        volumes:
            - ./node-red/data:/data
        environment:
            - TZ=Asia/Jerusalem
```

### Starting Services

**Start all services:**

```bash
cd docker
docker-compose up -d
```

**View logs:**

```bash
docker-compose logs -f
```

**Stop services:**

```bash
docker-compose down
```

### Service URLs

- **MQTT:** `mqtt://localhost:1883`
- **Node-RED:** http://localhost:1880

### Persistent Data

**Volumes:**

```
docker/
├── mqtt/
│   ├── config/
│   ├── data/
│   └── log/
└── node-red/
    └── data/
```

**Backup:**

```bash
tar -czf backup.tar.gz docker/mqtt docker/node-red
```

**Restore:**

```bash
tar -xzf backup.tar.gz
```

## Touch Controllers (Open Stage Control)

### Overview

[Open Stage Control](https://openstagecontrol.ammd.net/) (O-S-C) provides touchscreen and MIDI control surfaces for bridge stations. Tablets connect to an O-S-C server over HTTP; O-S-C widgets send OSC messages over UDP; Node-RED bridges OSC to the Starwards JSON-pointer command surface.

**Core convention: widget OSC address = admitted JSON pointer.**
A fader addressed `/reactor/power` just works — no new server code needed. The existing `@tweakable`/`@commandable` admission layer (see `docs/json-ptr.md`) enforces safety: writes to non-admitted paths are silently dropped.

### Architecture

```
Tablet (browser, O-S-C client)
    │  HTTP  (session + UI)
    ▼
Open Stage Control server (docker/osc/)
    │  UDP OSC  (widget interactions)
    ▼
Node-RED (docker/node-red/osc-bridge-flow.json)
    ├─ Write path:  udp-in :57120 → osc-decode → ship-write
    └─ Feedback:   ship-read (subscribe) → rate-limit → osc-encode → udp-out → O-S-C :57120
    │
    ▼
Starwards game server (ship-write / ship-read)
```

**No changes to core game state or server** — this is a pure infrastructure layer.

### Deployment

Start the `open-stage-control` and `node-red` services from `docker/docker-compose.yml`:

```bash
cd docker
docker-compose up -d open-stage-control node-red
```

O-S-C serves clients on host port **8090** (container port 8080; host 8080 is the game dev server).

The bridge flow is deployed by copying it over Node-RED's active flow file and restarting:

```bash
cp docker/node-red/osc-bridge-flow.json docker/node-red/data/flows.json
docker restart docker-node-red-1
```

The flow's `starwards-config` node points at `http://starwards-server:8080` — an `extra_hosts` alias in `docker-compose.yml` that maps to the docker host (`host-gateway`), where the game server runs.

Node-RED's dependencies (`@starwards/core`, `@starwards/node-red`, `node-red-contrib-osc`) are declared in `docker/node-red/data/package.json` — the same manifest Node-RED's palette manager maintains. The `@starwards` packages aren't on npm, so they are referenced as `file:` tarballs. `npm run node-red` does the whole cycle — builds the tarballs, places them in `data/`, runs the manifest-driven install, and restarts the docker stack:

```bash
npm run node-red   # scripts/dev-node-red.sh
```

The tarballs are gitignored (`*.tgz`), so run this once per fresh clone and whenever the `@starwards` modules change; `node-red-contrib-osc` needs nothing beyond the manifest entry.

### O-S-C Version and Installation

**O-S-C is NOT on npm.** The Docker image (`docker/osc/Dockerfile`) downloads the pure-Node release asset at build time:

```
open-stage-control_1.30.4_node.zip  (pinned; see docs/DEPENDENCIES.md)
```

The zip extracts to `open-stage-control_<version>_node/` with `index.js` as the entry point. The node package is inherently headless — no Electron, virtual framebuffer, or `--no-gui` flag needed. The container starts it with `--send node-red:57120` so widget interactions go to Node-RED's UDP-in by default (no per-widget `target` needed), and `--remote-root /sessions` so the in-app Session → Open dialog browses the mounted sessions dir instead of the server's working dir.

### Session Files

Session JSON files live in `docker/osc/sessions/`. Each file maps to a bridge station (e.g. `reactor-demo.json`). Sessions use the modern O-S-C format — `{"version": "1.30.4", "type": "session", "content": {root widget}}`; a bare root widget triggers legacy conversion and an "older version" warning dialog. A widget's OSC `address` field must match an admitted JSON pointer:

```json
{
  "type": "fader",
  "id": "reactor_power",
  "address": "/reactor/power",
  "range": { "min": 0, "max": 1 }
}
```

Widgets need no `target` — the server-level `--send node-red:57120` default covers them. Don't set a widget `value` in the session; current values arrive from the game via the subscription bootstrap.

**Per-client sessions** are routed by the custom module (`docker/osc/modules/starwards-bridge.js`): tablets connect with `?id=<station>` and the module calls `/SESSION/OPEN` to load that station's session.

### Subscription Bootstrap

When a client opens a session, the custom module walks the session JSON (`content` subtree), collects all widget addresses, and — after a 1 s delay so the client finishes loading before the initial values arrive — sends `/starwards/subscribe <address>` messages to Node-RED's subscribe port (`node-red:57121`, via the module-scripting `send()` API). Node-RED routes these to `ship-read` with `{ topic: address, subscribe: true }`.

`ship-read` then:
1. Emits the current value immediately (so widgets show correct state on load)
2. Listens for future state changes and emits them (feedback path)

Dynamic subscriptions are **additive** (multiple addresses accumulate) and **idempotent** (same address subscribed twice → subscribed once).

### Feedback Loop Prevention

Plain inbound OSC matching in O-S-C does **not** re-emit — receiving a value from Node-RED updates the widget display without triggering another send. `/SET` and user interaction do emit. The rate-limit node in the Node-RED flow (a `delay` node in `queue` mode) releases the latest message per address at 25 messages/second — it must stay per-topic, or the burst of initial values on session load loses all but one message.

### Writing a New Session

1. Create `docker/osc/sessions/<station>.json` following the format in `reactor-demo.json` (modern `{version, type, content}` wrapper).
2. Widget `address` must be an admitted JSON pointer (`/system/property`).
3. Read-only widgets (displays) should set `"bypass": true` to prevent them from emitting on user interaction.
4. Faders have no `label` property — label them with sibling `text` widgets (see the labeled columns in `reactor-demo.json`).
5. No restart needed — the sessions directory is volume-mounted and read per session open; just reload the tablet at `?id=<station>`.

### Testing

E2E specs live in `modules/e2e/test/osc-bridge.spec.ts`. They require a live O-S-C instance and are skipped in CI unless `OSC_BRIDGE_URL` is set. The Node-RED flow targets `starwards-server:8080` (the docker host), so the spec's own game server must own host port 8080 — **stop any running dev server first** and run the spec alone:

```bash
docker compose -f docker/docker-compose.yml up -d
OSC_BRIDGE_URL=http://localhost:8090 npm run test:e2e -- osc-bridge.spec.ts
```

The spec reaches Node-RED's UDP inputs through the host-published ports (`57123` → write path, `57121` → subscribe; see `docker-compose.yml`).

The specs cover:
- Write path (fader → UDP → ship state change)
- Feedback path (ship state → widget display via subscribe)
- Multi-controller (two clients see same state)
- Noise budget (rate-limit caps 50 changes/s to 25 packets/s)
- Rejection path (non-admitted write is dropped — state unchanged)

### Key Facts (avoid common mistakes)

| Mistake | Reality |
|---|---|
| `npm install open-stage-control` | Package doesn't exist; Docker image downloads `-node.zip` |
| `--headless` / `--no-gui` flags | The node package is headless by default; no flag needed |
| Node-RED `udp out` without `outport` | Shares the `udp in` socket when ports collide and goes stale on redeploy — set a dedicated `outport` |
| Widget DOM `id` attribute | DOM uses internal hash; Playwright reads via `el._widget_instance.getProp('id')` |
| `?session=x.json` per tablet | Use `?id=<station>` + custom module `/SESSION/OPEN` |
| Feedback loop via udp-out → O-S-C | Plain inbound match never re-emits; only `/SET`/interaction does |

## MQTT Integration

### Overview

MQTT enables pub/sub messaging for external systems.

**Architecture:**

```
Starwards ↔ Node-RED ↔ MQTT Broker ↔ External Systems
```

### Setup

**1. Start MQTT broker:**

```bash
cd docker
docker-compose up -d mqtt
```

**2. Configure Node-RED:**

- Add MQTT broker node
- Host: `mqtt` (Docker) or `localhost`
- Port: `1883`

**3. Create bridge flow:**

```
[ship-read] → [mqtt out: starwards/ship1/energy]
[mqtt in: starwards/commands/#] → [ship-write]
```

### Topic Structure

**Recommended Pattern:**

```
starwards/
├── ship1/
│   ├── reactor/
│   │   ├── energy
│   │   └── power
│   ├── thrusters/
│   │   └── 0/active
│   └── status
├── ship2/
│   └── ...
└── commands/
    ├── ship1/
    │   └── reactor/power
    └── ship2/
        └── ...
```

### Example: DMX Light Control

**Flow:**

```
[ship-read: /armor/health]
    → [function: calculate color]
    → [mqtt out: dmx/lights/ship1/color]
```

**Function Node:**

```javascript
const health = msg.payload;
let color;

if (health > 75) {
    color = 'green';
} else if (health > 25) {
    color = 'yellow';
} else {
    color = 'red';
}

msg.payload = color;
msg.topic = 'dmx/lights/ship1/color';
return msg;
```

### Example: Sound System

**Flow:**

```
[ship-read: /chainGun/isFiring]
    → [switch: true]
    → [mqtt out: audio/effects/gunfire]
```

## Custom Widget Creation

### Widget Structure

**Basic Widget:**

```typescript
// modules/browser/src/widgets/my-widget.ts
import type { ShipDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function myWidget(shipDriver: ShipDriver): DashboardWidget {
    class MyComponent {
        constructor(container: WidgetContainer) {
            // Build UI into the widget's DOM element
            const el = container.getElement().get(0);
            el.innerHTML = `
                <h2>My Widget</h2>
                <div class="content">
                    <div class="value" id="value">0</div>
                </div>
            `;

            // Observe state changes through the driver's event bridge
            const valueEl = el.querySelector('#value');
            shipDriver.events.on('/reactor/energy', () => {
                if (valueEl) {
                    valueEl.textContent = shipDriver.state.reactor.energy.toString();
                }
            });
        }
    }
    return { name: 'my-widget', type: 'component', component: MyComponent, defaultProps: {} };
}
```

### Widget with Controls

**Interactive Widget:**

```typescript
export function powerControl(shipDriver: ShipDriver): DashboardWidget {
    class PowerControlComponent {
        constructor(container: WidgetContainer) {
            const el = container.getElement().get(0);

            // Create slider
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '1';
            slider.step = '0.01';
            slider.value = shipDriver.state.reactor.power.toString();

            // Send command on change
            slider.addEventListener('input', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value);
                shipDriver.sendJsonCmd('/reactor/power', value);
            });

            // Update slider when state changes
            shipDriver.events.on('/reactor/power', () => {
                slider.value = shipDriver.state.reactor.power.toString();
            });

            el.appendChild(slider);
        }
    }
    return { name: 'power-control', type: 'component', component: PowerControlComponent, defaultProps: {} };
}
```

### Widget with Tweakpane

**Advanced Controls:**

```typescript
import { createWidgetPane } from '../panel';

export function systemControl(shipDriver: ShipDriver): DashboardWidget {
    class SystemControlComponent {
        constructor(container: WidgetContainer) {
            const { pane } = createWidgetPane(container, 'System Control');

            // Add controls
            pane.addBinding(shipDriver.state.reactor, 'power', {
                min: 0,
                max: 1,
                step: 0.01,
            }).on('change', (ev) => {
                shipDriver.sendJsonCmd('/reactor/power', ev.value);
            });

            pane.addBinding(shipDriver.state.reactor, 'coolantFactor', {
                min: 0,
                max: 1,
                step: 0.01,
            }).on('change', (ev) => {
                shipDriver.sendJsonCmd('/reactor/coolantFactor', ev.value);
            });
        }
    }
    return { name: 'system-control', type: 'component', component: SystemControlComponent, defaultProps: {} };
}
```

### Widget Registration

**Register in dashboard:**

```typescript
// modules/browser/src/screens/ship.ts
import { myWidget } from '../widgets/my-widget';
import { powerControl } from '../widgets/power-control';

dashboard.registerWidget(myWidget(shipDriver));
dashboard.registerWidget(powerControl(shipDriver));
```

**Add to screen:**

```typescript
// modules/browser/src/screens/ship.ts
export const shipScreen = {
    content: [
        {
            type: 'row',
            content: [
                { type: 'component', componentName: 'my-widget' },
                { type: 'component', componentName: 'power-control' },
            ],
        },
    ],
};
```

## New Ship System Creation

### Complete System Example

**1. Create Design State:**

```typescript
// modules/core/src/ship/shield.ts
import { DesignState } from './system';
import { gameField } from '../game-field';

class ShieldDesignState extends DesignState {
    @gameField('float32') maxStrength = 1000;
    @gameField('float32') rechargeRate = 10;
    @gameField('float32') energyCost = 5;
    @gameField('float32') damage50 = 50;
}
```

**2. Create System State:**

```typescript
import { SystemState } from './system';
import { range } from '../range';
import { defectible } from './system';

export class Shield extends SystemState {
    readonly name = 'Shield';

    @gameField(ShieldDesignState)
    design = new ShieldDesignState();

    @gameField('float32')
    @range((t: Shield) => [0, t.design.maxStrength])
    strength = 1000;

    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 1, name: 'efficiency' })
    efficiency = 1;

    get broken(): boolean {
        return this.efficiency < 0.1;
    }
}
```

**3. Add to ShipState:**

```typescript
// modules/core/src/ship/ship-state.ts
import { Shield } from './shield';

export class ShipState extends Spaceship {
    @gameField(Shield)
    shield!: Shield;
}
```

**4. Create Manager:**

```typescript
// modules/core/src/ship/shield-manager.ts
import { ShipState } from './ship-state';
import { IterationData } from '../updateable';

export class ShieldManager {
    constructor(private state: ShipState) {}

    update({ deltaSeconds }: IterationData) {
        const shield = this.state.shield;

        // Recharge
        if (!shield.broken && shield.strength < shield.design.maxStrength) {
            shield.strength = Math.min(
                shield.design.maxStrength,
                shield.strength + shield.design.rechargeRate * shield.efficiency * deltaSeconds,
            );
        }
    }

    absorbDamage(amount: number): number {
        const absorbed = Math.min(amount, this.state.shield.strength);
        this.state.shield.strength -= absorbed;
        return amount - absorbed; // Remaining damage
    }
}
```

**5. Integrate with Ship Manager:**

```typescript
// modules/core/src/ship/ship-manager.ts
import { ShieldManager } from './shield-manager';

export class ShipManagerPc extends ShipManager {
    private shieldManager: ShieldManager;

    constructor(...) {
        super(...);
        this.shieldManager = new ShieldManager(this.state);
    }

    update(id: IterationData) {
        super.update(id);
        this.shieldManager.update(id);
    }

    // Use in damage handling
    protected handleDamage(amount: number) {
        const remaining = this.shieldManager.absorbDamage(amount);
        if (remaining > 0) {
            // Apply to armor/hull
            this.state.armor.health -= remaining;
        }
    }
}
```

**6. Create Widget:**

```typescript
// modules/browser/src/widgets/shield.ts
import { ShipDriver } from '@starwards/core';
import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function shieldWidget(shipDriver: ShipDriver): DashboardWidget {
    class ShieldComponent {
        constructor(container: WidgetContainer) {
            const el = container.getElement().get(0);
            el.innerHTML = `
                <h3>Shield</h3>
                <div class="shield-bar">
                    <div class="shield-fill" id="shield-fill"></div>
                </div>
                <div class="shield-value" id="shield-value">0</div>
            `;

            const fill = el.querySelector('#shield-fill') as HTMLElement;
            const value = el.querySelector('#shield-value') as HTMLElement;

            shipDriver.events.on('/shield/strength', () => {
                const strength = shipDriver.state.shield.strength;
                const max = shipDriver.state.shield.design.maxStrength;
                const percent = (strength / max) * 100;
                fill.style.width = `${percent}%`;
                value.textContent = `${Math.round(strength)} / ${max}`;
            });
        }
    }
    return { name: 'shield', type: 'component', component: ShieldComponent, defaultProps: {} };
}
```

**7. Add Configuration:**

```typescript
// modules/core/src/configurations/demo-ship.ts
export const demoShipConfig = {
    // ... other systems
    shield: {
        maxStrength: 1000,
        rechargeRate: 10,
        energyCost: 5,
        damage50: 50,
    },
};
```

## Custom Space Objects

### Creating New Object Type

**1. Define Object Class:**

```typescript
// modules/core/src/space/mine.ts
import { SpaceObjectBase } from './space-object-base';
import { gameField } from '../game-field';
import { Faction } from './faction';

export class Mine extends SpaceObjectBase {
    readonly type = 'Mine' as const;

    @gameField('int8')
    faction: Faction = Faction.NONE;

    @gameField('float32')
    damage = 100;

    @gameField('float32')
    triggerRadius = 5;

    @gameField('float32')
    armTime = 2; // Seconds until armed

    @gameField('boolean')
    armed = false;

    init(id: string, position: Vec2, faction: Faction): this {
        this.id = id;
        this.position = position;
        this.faction = faction;
        this.radius = 1;
        return this;
    }

    static isInstance(o: unknown): o is Mine {
        return (o as Mine)?.type === 'Mine';
    }
}
```

**2. Add to SpaceObjects Type:**

```typescript
// modules/core/src/space/index.ts
import { Mine } from './mine';

export type SpaceObjects = {
    Spaceship: Spaceship;
    Projectile: Projectile;
    Explosion: Explosion;
    Asteroid: Asteroid;
    Waypoint: Waypoint;
    Mine: Mine; // Add new type
};

export type SpaceObject = SpaceObjects[keyof SpaceObjects];
```

**3. Add to SpaceState:**

```typescript
// modules/core/src/space/space-state.ts
import { Mine } from './mine';

export class SpaceState extends Schema {
    @gameField({ map: Mine })
    private readonly Mine = new MapSchema<Mine>();

    public get(id: string): SpaceObject | undefined {
        return (
            this.Projectile.get(id) ??
            this.Asteroid.get(id) ??
            this.Spaceship.get(id) ??
            this.Explosion.get(id) ??
            this.Waypoint.get(id) ??
            this.Mine.get(id) // Add to lookup
        );
    }

    public *maps(): IterableIterator<MapSchema> {
        yield this.Projectile;
        yield this.Explosion;
        yield this.Asteroid;
        yield this.Spaceship;
        yield this.Waypoint;
        yield this.Mine; // Add to iteration
    }
}
```

**4. Add Collision Handling:**

```typescript
// modules/core/src/logic/space-manager.ts
private handleCollisions(deltaSeconds: number) {
    this.collisions.checkAll((response: SWResponse) => {
        const subject = this.collisionToState.get(response.a);
        const object = this.collisionToState.get(response.b);

        // Handle mine collisions
        if (Mine.isInstance(subject) && subject.armed) {
            if (Spaceship.isInstance(object)) {
                this.detonateMine(subject);
            }
        }

        // ... existing collision handling
    });
}

private detonateMine(mine: Mine) {
    const explosion = new Explosion();
    explosion.init(
        uniqueId('explosion'),
        mine.position.clone(),
        mine.damage / 100
    );
    this.insert(explosion);
    mine.destroyed = true;
}
```

**5. Add Blip Renderer:**

```typescript
// modules/browser/src/radar/blips/blip-renderer.ts
import { Mine } from '@starwards/core';

function renderMine(mine: Mine, graphics: Graphics) {
    graphics.beginFill(0xff0000);
    graphics.drawCircle(0, 0, mine.radius);
    graphics.endFill();

    if (!mine.armed) {
        // Draw arming indicator
        graphics.lineStyle(1, 0xffff00);
        graphics.drawCircle(0, 0, mine.triggerRadius);
    }
}

// Add to renderer map
const renderers = {
    // ... existing renderers
    Mine: renderMine,
};
```

**6. Add Creation Command:**

```typescript
// modules/core/src/space/space-commands.ts
export type CreateMineOrderArg = {
    position: XY;
    faction: Faction;
};

// In SpaceState
public createMineCommands = Array.of<CreateMineOrderArg>();

// In SpaceManager.update()
for (const cmd of this.state.createMineCommands) {
    const mine = new Mine().init(
        makeId(),
        Vec2.make(cmd.position),
        cmd.faction
    );
    this.insert(mine);
}
this.state.createMineCommands = [];
```

## Related Documentation

- [LLM_CONTEXT.md](LLM_CONTEXT.md) - Quick-start guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [API_REFERENCE.md](API_REFERENCE.md) - API documentation
- [PATTERNS.md](PATTERNS.md) - Code patterns
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development workflows
- [CLAUDE.md](../CLAUDE.md) - Original developer guide
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
