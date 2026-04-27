# Emissions & Detection

**Status:** Partial ([#1001](https://github.com/starwards/starwards/issues/1001))

## Concept

Ships emit detectable signatures based on their system activity. Higher power consumption = larger emissions = easier to detect at range. This creates a stealth vs. capability tradeoff — powering down systems reduces detectability but also reduces combat effectiveness.

## What's built

- System power consumption model (each system draws energy based on power level)
- Basic emissions concept in the codebase

## What's designed but not built

- Emissions signature calculation (aggregate of all system power draws)
- Detection range modification based on target emissions
- Stealth gameplay (running silent = low power = hard to detect)
- Interaction with scan levels (low-emission targets harder to scan)

## Design questions

- How does emissions interact with warp topology? (warp generates large signature?)
- Should there be active vs passive radar modes? (active = better range but broadcasts position)
- How granular should signature masking be? (per-system or aggregate?)

This mechanic is not on the critical path for the first LARP event but would significantly deepen Signals and Navigator gameplay.
