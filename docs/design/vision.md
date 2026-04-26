# Vision

## What is Starwards?

Starwards is a multiplayer spaceship bridge simulator where crews of 2-6 players operate stations on a starship — piloting, weapons, engineering, signals intelligence, navigation, and communications. It's built specifically for Live Action Role-Playing (LARP) events in the [Helios universe](https://helios-larp.web.app), a hard sci-fi setting in the 23rd century Sol system.

## Who is it for?

**Primary audience:** LARP organizers running spaceship-themed events. They need a simulator that:
- Runs for hours (not 30-minute sessions)
- Lets GMs control the narrative (no accidental player death)
- Supports modular station layouts (different screens per event)
- Works on LAN with commodity hardware

**Secondary audience:** Players crewing stations during events. They need:
- Meaningful roles with real decisions (not button-pressing theater)
- Information density that creates expertise and teamwork
- Systems that malfunction interestingly (not just "health bar goes down")

**Tertiary audience:** Contributors and the open-source community. Starwards is AGPL-3.0 licensed for knowledge-sharing in the LARP community.

## Why not EmptyEpsilon?

The team used and extended EmptyEpsilon from 2016 to 2021, eventually maintaining a [fork](https://github.com/starwards/EmptyEpsilon) with LARP-specific features. EE was designed for short game sessions and resisted changes needed for LARP play (large maps, extended scenarios, flexible stations). After 9 months of work on a large-map feature was rejected upstream, the team decided to start fresh.

Starwards differs from EmptyEpsilon in philosophy:
- **Malfunction over destruction** — damage causes system malfunctions, not ship explosions. TPK is always a GM decision.
- **Anti-abstraction** — no hit points. Ships have concrete system states. Players create their own abstractions from technical readouts.
- **Hard sci-fi foundation** — physics-based systems with internal coherence. No energy shields, no artificial drag.
- **LARP-native** — built for hours-long play, physical control integration (IoT), and GM narrative control from day one.

## Design Principles

1. **Systems create roles.** The pilot sees thrust vectors; the engineer sees power distribution; the signals officer sees scan levels. Same ship, different information, different expertise.
2. **Interaction is essentially negative** (Bret Victor). Screens display information; physical controls (joysticks, buttons) drive actions. Minimize clicks.
3. **Malfunction is gameplay.** A broken thruster doesn't end the game — it creates a drift recovery challenge for the pilot and a repair task for the engineer.
4. **The GM is the storyteller.** Game rules never auto-destroy player ships. The simulator provides tools; the GM provides the narrative.
5. **Foundation-first development.** Build systems that other features derive from. Don't design in isolation.

## The Helios Universe

Starwards powers the [Helios LARP](https://helios-larp.web.app) — a 23rd century setting with factions across the Sol system (Federation, Corporate, MCF, Criminal, Independent). The lore includes detailed colonies (Ceres, Daphnis), military academies, corporate entities, and faction dynamics. The simulator brings this universe to life at the bridge.
