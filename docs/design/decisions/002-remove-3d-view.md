# Decision: Remove 3D main screen view

**Date:** 2024-03
**Status:** Accepted

## Context

A 3D Babylon.js view had been running since 2021 as the "main screen" — the shared display all crew members could see. A friend with Unity expertise offered to build a proper 3D client. Meanwhile, the existing 3D view was maintenance overhead and not providing proportional value for LARP play.

## Decision

Delete the 3D Babylon.js code (4,523 lines) and go 2D-only. Plan for a future separate Unity client for 3D visualization if desired.

## Consequences

- **Reduced maintenance burden** — significant code and dependency removal.
- **Better gameplay:** For LARP tactical play, 2D is genuinely superior — see all ships at once, clear distances, no occlusion.
- **Decoupled architecture:** 3D becomes an optional viewer, not a core dependency.
- **Visual impact:** Events lose the immersive main screen view until a Unity client materializes. 2D radar views fill the role but lack cinematic appeal.
