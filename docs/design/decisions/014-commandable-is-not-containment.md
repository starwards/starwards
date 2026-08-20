# Decision: The `@commandable()` whitelist is accidental-exposure protection, not adversarial containment

**Date:** 2026-08
**Status:** Accepted

## Context

Today's `ShipRoom` (`modules/server/src/ship/room.ts`) has no
connection-level GM-vs-player identity: GM and players join the same room
and send through the same `onMessage('*')` handler. The whitelist's
GM-side admissions (`@tweakable` + `DesignState`) are therefore reachable
from any client — a determined attacker can abuse the GM tweak surface
from a player seat.

## Decision

The `@commandable()` whitelist is **accidental-exposure protection**, not
adversarial-player containment.

## Consequences

This is an **accepted limitation** of the current architecture. The value
of the whitelist is that a contributor who adds a bare `@gameField` for
sync purposes does NOT get an accidental wire-write handle for free.
Closing the adversarial gap would require a connection-level role split
(`ShipRoom.onAuth`, distinct message channels, or session tokens) — a
scope that touches server, lobby, and every station screen. Starwards is
a LARP prop used among trusted players; that cost is not justified by the
threat model.
