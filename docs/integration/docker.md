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
        image: 'eclipse-mosquitto:1.6.10'
        restart: always
        ports:
            - '1883:1883'
        volumes:
            - ./mqtt/config:/mosquitto/config
            - ./mqtt/data:/mosquitto/data
            - ./mqtt/log:/mosquitto/log
    node-red:
        image: nodered/node-red:3.0.2
        labels:
            # Hooks for preview wrapper-image builds (build-preview-images.sh).
            # pre-run: BEFORE bind mounts are baked — stable deps land in a
            # docker layer that stays cached across builds. Keep the version
            # in sync with node-red/data/package.json.
            starwards.preview.pre-run: cd /data && npm install node-red-contrib-osc@^1.1.0
            # run: AFTER bind mounts are baked — installs the @starwards file:
            # tgz deps, which are rebuilt from the branch on every push.
            starwards.preview.run: cd /data && npm install
        restart: always
        extra_hosts:
            - 'starwards-server:host-gateway'
        environment:
            - TZ=Asia/Jerusalem
        ports:
            - '1880:1880'
            - '57123:57120/udp' # OSC write path in (host 57123; O-S-C owns host 57120)
            - '57121:57121/udp' # subscribe messages in
        volumes:
            - ./node-red/data:/data
    open-stage-control:
        build:
            context: ./osc
            dockerfile: Dockerfile
        restart: always
        ports:
            - '8090:8080' # O-S-C HTTP client port (host 8090; 8080 is the local dev server)
            - '57120:57120/udp' # OSC UDP receive (from tablets)
        volumes:
            - ./osc/sessions:/sessions:ro
            - ./osc/modules:/modules:ro
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
- **Node-RED:** http://localhost:1880 (OSC UDP in: host 57123)
- **Open Stage Control:** http://localhost:8090 (OSC UDP in from tablets: 57120)

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
