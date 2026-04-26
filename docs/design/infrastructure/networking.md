# Networking

**Status:** Done

## Architecture

Starwards uses **Colyseus** for multiplayer — room-based state synchronization over WebSocket. The server is authoritative; clients receive state updates and send commands via JSON Pointer.

## LAN deployment

The game is designed for LAN play at LARP events. Server runs on one machine; clients connect via browser on any device on the network. No internet required.

## Node-RED integration

The **colyseus-events** library bridges Colyseus state sync with event-driven paradigms. This enables:
- Node-RED flows that react to game state changes
- IoT device integration (lights, switches, sound effects)
- External system triggers (damage → physical alarm, warp → lighting change)

## What's needed for events

- [ ] Network deployment guide — LAN topology, hardware requirements, port configuration
- [ ] Multi-bridge stress testing — 3+ ships x 5 crew (untested at scale)
- [ ] Fallback procedures — what happens if the server crashes mid-event
- [ ] Client reconnection — handle dropped connections gracefully
