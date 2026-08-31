---
audience: both
depth: deep
related:
  - INTEGRATION.md
  - integration/mqtt.md
  - integration/docker.md
  - json-ptr.md
last_verified: 2026-08-18
---

# Node-RED Integration

## Overview

Node-RED integration enables external control and monitoring of Starwards via visual programming flows.

**Use Cases:**

- Hardware integration (DMX lights, sound systems)
- Dashboard creation
- MQTT bridging
- Custom automation
- External displays

## Installation

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

## Available Nodes

### starwards-config

**Purpose:** Connection configuration (shared across ship nodes)

**Configuration:**

- Server URL (e.g., `http://localhost:8080`)
- Ship ID

**Usage:**

1. Drag `starwards-config` to flow
2. Double-click to configure
3. Enter server URL and ship ID
4. Other nodes reference this config

### ship-read

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

### ship-write

**Purpose:** Write ship state properties

**Configuration:**

- Config: Select starwards-config node

**⚠️ Whitelist:** Node-RED writes go through the same JSON Pointer
admission check as browser clients. Only `@commandable`, `@tweakable`,
or `DesignState` fields may be written. Writes to unannotated fields
throw and are logged by `ShipRoom`. See `../json-ptr.md` for the full
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

## Example Flows

### Example 1: Energy Monitor

**Flow:**

```
[ship-read: /reactor/energy] → [gauge] → [dashboard]
```

**Configuration:**

1. Add `ship-read` node
2. Set pattern: `/reactor/energy`
3. Add gauge widget
4. Connect to dashboard

### Example 2: Power Control

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

### Example 3: Alert System

**Flow:**

```
[ship-read: /armor/health] → [switch: <20] → [mqtt out: alerts/low-health]
```

**Configuration:**

1. Monitor armor health
2. Switch node: route if < 20
3. Publish to MQTT alert topic

### Example 4: Multi-Ship Dashboard

**Flow:**

```
[ship-read: ship-1] → [dashboard: Ship 1]
[ship-read: ship-2] → [dashboard: Ship 2]
```

**Configuration:**

1. Create multiple config nodes (one per ship)
2. Create separate read nodes
3. Display on dashboard

## Connection Management

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

## Error Handling

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

## Advanced Usage

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
