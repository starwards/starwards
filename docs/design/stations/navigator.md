# Navigator Station

**Status:** Designed (not yet implemented)
**Crew role:** Navigator — plots routes through warp topology.
**Blocked by:** Warp frequency topology mechanic
**Issues:** [#1261](https://github.com/starwards/starwards/issues/1261), [#1262](https://github.com/starwards/starwards/issues/1262)

## What it does

Space has 10 warp frequencies (Alpha through Kappa), each with a different procedurally generated efficiency topology. The navigator reads these "terrain maps" and plots routes through high-efficiency zones, choosing when to switch frequencies for optimal travel.

## Key mechanics

- **10 frequencies** with distinct characteristics (broad highways, narrow veins, chaotic evasion paths, etc.)
- **Efficiency zones:** speed modifier from 0.1x (poor) to 2.0x (excellent)
- **Route plotting:** click-and-drag on heatmap overlay
- **Frequency transitions:** 5-second penalty per change
- **Routes are shareable:** Navigator → Relay → Pilot

## Widgets

- Radar with real-time efficiency heatmap overlay
- Frequency selector (hotkeys 1-0)
- Color gradient: Red (poor) → Yellow → Green → Cyan (best)
- Route efficiency preview
- Saved route library

## Why this station exists

EmptyEpsilon has no equivalent — this is novel gameplay. It creates a crew role that's about reading space "terrain" and planning, not real-time reaction. The navigator's expertise grows over time as they learn frequency patterns. Routes provide 20-40% speed advantage, making this role strategically valuable.

## Dependencies

1. Warp frequency topology engine ([#1182](https://github.com/starwards/starwards/issues/1182)) — procedural noise generation, efficiency calculation
2. Navigator radar widget ([#1262](https://github.com/starwards/starwards/issues/1262))
3. Then the full station ([#1261](https://github.com/starwards/starwards/issues/1261))
