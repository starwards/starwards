# Decision: Build from scratch instead of extending EmptyEpsilon

**Date:** 2021-01
**Status:** Accepted

## Context

The team used and maintained a fork of EmptyEpsilon from 2016 to 2021 for Helios LARP events. Over time, the gap between what EE was designed for (short game sessions) and what LARP needed (hours-long play, flexible stations, GM narrative control) grew too large. A 9-month effort to add large map support was rejected upstream. The fork diverged to the point where maintaining it was a significant burden.

## Decision

Start a new simulator from scratch using web technologies (TypeScript, Colyseus, PixiJS, React). Design specifically for LARP needs from day one. Keep the EE fork running for events during the transition period.

## Consequences

- **Years of development needed** before reaching EE feature parity. The team accepted this explicitly: "It will take years to complete."
- **Technology freedom** — web stack enables browser-based clients, IoT integration, customizable UI.
- **Design freedom** — malfunction-over-destruction, sectional armor, warp topology, scan levels — none feasible as EE modifications.
- **Maintenance burden shifts** — from fighting EE's architecture to building on a clean foundation.
- **Risk:** The EE fork still needs to work for events until Starwards is ready. Two codebases to maintain during transition.
