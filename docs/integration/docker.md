---
audience: both
depth: deep
source_of_truth:
  - docker/docker-compose.yml
related:
  - INTEGRATION.md
  - integration/node-red.md
  - integration/mqtt.md
  - integration/open-stage-control.md
last_verified: 2026-08-18
---

# Docker Deployment

## Docker Compose Setup

**File:** [`docker/docker-compose.yml`](../../docker/docker-compose.yml)

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

## Starting Services

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

## Service URLs

- **MQTT:** `mqtt://localhost:1883`
- **Node-RED:** http://localhost:1880

## Persistent Data

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
