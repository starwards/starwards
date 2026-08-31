---
audience: both
depth: light
related:
  - INTEGRATION.md
  - integration/node-red.md
  - integration/docker.md
last_verified: 2026-08-18
---

# MQTT Integration

## Overview

MQTT enables pub/sub messaging for external systems.

**Architecture:**

```
Starwards ↔ Node-RED ↔ MQTT Broker ↔ External Systems
```

## Setup

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

## Topic Structure

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

## Example: DMX Light Control

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

## Example: Sound System

**Flow:**

```
[ship-read: /chainGun/isFiring]
    → [switch: true]
    → [mqtt out: audio/effects/gunfire]
```
