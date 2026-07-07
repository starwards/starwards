# Distribution

**Status:** Partial

## What's built

- **pkg.js builds** — creates standalone executables after every change
- **Docker compose** — containerized deployment option
- **GitHub Actions CI** — automated build, lint, test pipeline

## What's needed

- [ ] Versioned downloadable binaries ([#1295](https://github.com/starwards/starwards/issues/1295)) — GitHub Release binaries on version tags, version in lobby, README download instructions
- [ ] Event setup documentation — step-by-step guide for LAN deployment
- [ ] Network topology guide — what hardware, how to connect, what ports

## Target: LARP organizer can set up a game without developer help

The distribution story needs to work for people who can follow instructions but aren't developers. Download, unzip, run, connect clients. Current pkg.js builds achieve this technically but lack documentation and versioned release management.
