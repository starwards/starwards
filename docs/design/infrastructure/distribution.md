# Distribution

**Status:** Partial — reviewer path shipped (#2219, #2221, #2222, #2223); event/LAN deployment guide still open

## What's built

- **pkg.js builds** — creates standalone executables after every change
- **Docker compose** — containerized deployment option
- **GitHub Actions CI** — automated build, lint, test pipeline
- **Versioned downloadable binaries** ([#1295](https://github.com/starwards/starwards/issues/1295)) — GitHub Release binaries on version tags, version shown in the lobby, README download instructions
- **Rolling `master` pre-release** ([#2221](https://github.com/starwards/starwards/issues/2221)) — every green `master` build republishes `starwards.exe` at a stable, unauthenticated URL, so reviewers always get current `master` without a version tag
- **First-run UX** ([#2222](https://github.com/starwards/starwards/issues/2222)) — the packaged exe auto-opens the lobby in the default browser and the lobby shows a QR code per LAN address for phones/tablets to join
- **Reviewer path** ([#2223](https://github.com/starwards/starwards/issues/2223)) — [`docs/REVIEWING.md`](../../REVIEWING.md) walks a non-developer through download, SmartScreen/Firewall prompts, connecting other devices, and sending structured feedback via the `playtest-feedback` issue template

## What's needed

- [ ] Event setup documentation — step-by-step guide for LAN deployment
- [ ] Network topology guide — what hardware, how to connect, what ports

## Target: LARP organizer can set up a game without developer help

The distribution story needs to work for people who can follow instructions but aren't developers. Download, unzip, run, connect clients. The reviewer path (single stable download URL, guided first run, structured feedback) is covered; a full event-setup guide for organizers running LAN games with multiple crews is still open.
