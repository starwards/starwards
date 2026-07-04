# Event Readiness Checklist

What's needed to run a full Helios LARP event with Starwards.

## Stations (crew positions that must work)

- [x] **Pilot** — flight control, two modes, helm assist
- [x] **Weapons** — chaingun, torpedoes, targeting, ammo management
- [x] **ECR / Engineering** — power, heat, coolant, system status
- [x] **Signals** — long-range radar, target info, systems status, waypoint placement (station shipped; scanning/hacking/tracking intel mechanics still designed-only)
- [ ] **Navigator** — warp route plotting (designed, not built)
- [ ] **Relay** — comms, probes, route coordination (designed, not built)
- [x] **GM screen** — widget system works, needs scenario presets

## Ship Models

- [x] Fighter-class (1-2 crew) — Dragonfly SF-22
- [ ] Corvette-class (4-6 crew) — needed for multi-station play
- [ ] Multiple ship templates (8 types designed: Scout through Merchant)
- [ ] Ship model constants configurable via design panel

## Game Mechanics

- [x] Newtonian flight with collision detection
- [x] Armor system (sectional, penetration, angle-based)
- [x] Damage → malfunction system (soft/hard problems)
- [x] Power distribution and reactor management
- [x] Heat management and overheat cascades
- [x] Weapons (chaingun, torpedoes, blast propagation)
- [x] Basic warp drive
- [x] Bot AI (tactical orders, idle behaviors)
- [x] Scan levels (3-tier progressive reveal: UFO/Basic/Advanced)
- [x] Signals jobs (scan/hack/track queue) — SignalsJobManager + Signals state implemented and run each tick
- [ ] Warp frequency topology (efficiency zones, route optimization)
- [x] Ship-in-ship docking
- [ ] Repair system (3-tier, field repairs)

## GM Tooling

- [x] Object lifecycle (create/destroy ships, asteroids)
- [x] NPC ship orders (move, attack, follow)
- [x] Real-time tweakpane state modification
- [x] Right-click GM commands
- [ ] Scenario presets / encounter templates
- [ ] Save/load screen configurations
- [ ] Battle pacing tools

## Infrastructure

- [x] Colyseus multiplayer (LAN-ready)
- [x] Node-RED integration (IoT bridge)
- [x] Playwright E2E test suite
- [x] pkg.js executable builds
- [x] Crash recovery — server rooms persist, auto-reconnect works, layouts saved to localStorage
- [ ] Connection status indicator (player needs to see if they're reconnected)
- [ ] Versioned downloadable binaries
- [ ] Scenario file loading (TypeScript scenarios loaded from disk)
- [ ] Event setup documentation
- [ ] Network deployment guide (LAN topology)

## Physical Setup

- [x] DMX lighting (connected via Node-RED)
- [ ] Custom keyboards / adapted MIDI controllers for station input
- [ ] Keys configuration ([#834](https://github.com/starwards/starwards/issues/834)) — currently hardcoded
- [ ] Sound / audio atmosphere (alert tones, weapon sounds, ambient)
- [ ] Station hardware requirements documented
- [ ] Setup checklist (order of operations for event day)
- [ ] Per-station controls cheat sheet

## Pre-Event Validation

- [ ] **Set a playtest date** — even a small one (4-6 people, 3-station bridge)
- [ ] Multi-bridge stress test (3+ ships x 5 crew)
- [ ] Full scenario dry run with crew
- [ ] GM workflow rehearsal
- [ ] Fallback plan (EmptyEpsilon still available)
