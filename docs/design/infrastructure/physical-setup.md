# Physical Setup & Hardware

**Status:** Undocumented — needs planning before first event

## Existing integrations

- **Node-RED** — colyseus-events library bridges game state to IoT ecosystem
- **DMX lighting** — already in use (connected via Node-RED)
- **Custom input devices** — planned: custom keyboards and/or adapted MIDI controllers for station controls

## What needs documenting

### Network topology
- [ ] Server hardware requirements (CPU, RAM, expected load with N ships x M crew)
- [ ] LAN setup guide (router, switch, cables, WiFi considerations)
- [ ] Port configuration (Colyseus WebSocket, Node-RED, admin panel)
- [ ] Fallback if server machine overheats after 3+ hours

### Station hardware
- [ ] Per-station requirements (screen size, browser compatibility, input devices)
- [ ] Custom keyboard / MIDI controller setup and mapping
- [ ] How input devices connect to the game (USB → browser events? Node-RED?)

### Atmosphere / IoT
- [ ] DMX lighting integration guide (Node-RED flows for game events → light changes)
- [ ] Sound system setup (alert tones, weapon sounds, ambient — via Arwes bleeps or external?)
- [ ] Physical props (repair stations, consoles, anything Node-RED controlled)

### Event day
- [ ] Setup checklist (order of operations: server first, then clients, then Node-RED, then DMX)
- [ ] Troubleshooting guide (common failures and fixes)
- [ ] GM quick-reference card
- [ ] Player station cards (per-station controls cheat sheet)

## Input devices

The design philosophy is "physical controls drive actions, screens display information." This means joysticks, buttons, and custom keyboards are first-class inputs — not afterthoughts.

### Current state
- Keys configuration is hardcoded ([#834](https://github.com/starwards/starwards/issues/834))
- Gamepad support exists (SpeedLink controller mentioned)
- No MIDI mapping layer

### Options for custom input
1. **Custom keyboards** — build physical consoles with mechanical switches, USB HID
2. **MIDI controllers** — repurpose existing MIDI devices (knobs, faders, buttons), needs MIDI-to-keypress mapping layer
3. **Node-RED bridge** — physical devices → Node-RED → game commands via colyseus-events
4. **WebMIDI API** — browser-native MIDI support, direct integration in station screens

The Node-RED path is interesting for DMX-connected controls (same infrastructure), but WebMIDI might be simpler for station-local MIDI devices.
