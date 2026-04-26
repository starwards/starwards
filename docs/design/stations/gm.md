# GM Screen

**Status:** Partial
**Role:** Game Master — controls the game world and narrative.

## What's built

- **Widget system:** Drag-and-drop customizable screens (golden-layout)
- **Object lifecycle:** Create and destroy ships, asteroids, space objects
- **NPC control:** Tactical orders (MOVE, ATTACK, FOLLOW) and idle behaviors (ROAM, STAND_GROUND, PLAY_DEAD)
- **Right-click commands:** Quick GM actions on objects
- **Tweakpane integration:** Real-time modification of any ship/object property
- **JSON Pointer interface:** Direct state manipulation

## What's needed for LARP events

- [ ] Scenario presets / encounter templates (spawn predefined formations)
- [ ] Save/load screen configurations
- [ ] GM-to-player communication (text or trigger-based)
- [ ] Battle pacing tools (slow down, pause, speed up time?)
- [ ] NPC AI scripting (EE has Lua; Starwards has nothing equivalent)
- [ ] Alert level triggers (green/yellow/red across all stations)
- [ ] Event logging (what happened when, for post-game debrief)

## EE comparison

EmptyEpsilon GMs have powerful Lua scripting for scenario authoring — timed waves, conditional spawns, dialogue trees, victory conditions. Starwards currently relies on manual GM intervention. This is the biggest capability gap for event readiness.

## Design philosophy

The GM should never need to touch code during an event. All controls should be visual, real-time, and robust against mistakes (undo, confirm destructive actions). The GM is a storyteller, not a sysadmin.
