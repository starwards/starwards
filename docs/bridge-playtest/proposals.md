# Bridge Gap-Closing Proposals

Candidate ideas extracted from [`sw-vs-ee-comparison-narrative.md`](sw-vs-ee-comparison-narrative.md). **All items here are drafts unless promoted to [`decisions.md`](decisions.md).**

Source analysis (problems these address) lives in the narrative doc; this file holds only the proposed moves.

---

## Per-fight Signals→Weapons handoff

Add a per-fight value that lives at Signals and matters to Weapons. Not a copy of EE's frequency dial — examples considered: a weakness scanning reveals, a hull weak vector, an enemy reactor signature. Every encounter generates a fresh value one station must discover and another must use, handed off by voice. Gives Signals a reason to exist in combat, a reason to talk, and a reason for Weapons to listen. Stack two or three of these rather than one heavy mechanic.

> **Status:** Superseded in part by the 2026-05-03 armor/ammo decision (see `decisions.md`). Other candidate values (weak vector, reactor signature) remain open.

## PDC + Brace cascade (Weapons defends the ship)

A point-defense cannon — successor to EE's beams — that doubles as a missile interceptor. When the PDC saturates, the weapons officer calls "BRACE." The crew commits: engineering shunts power to armor, the pilot orients the armor face toward the threat, the captain decides whether to trust the call. False braces still eat the cooldown, so calling correctly under uncertainty becomes a real Weapons skill. Gives Weapons an outbound voice, a reason to hear from Signals (long-range salvo detection), a reason to need the pilot, and a reason to negotiate with engineering. Produces the EE-style forced verbal cascade across stations under attack.

## Magazine reload as Engineering allocation

Today reload happens passively in the background. Make it a deliberate Engineering allocation — power and coolant for fifteen-to-thirty seconds — that has to be requested and timed. Gives Weapons and Engineering a shared task during cruise (the dead-air phase), a real captain decision in combat ("reload now, vulnerable, or push through with the last salvo?"), and a tighter coupling around the heat budget. Lowest-cost addition in the plan — magazine system already exists in code.

## Dedicated `/signals` subsystem

Today scanning shares power with the pilot and weapons radars — they all rise and fall together, so engineering can't really make a Signals tradeoff. Splitting `/signals` into its own subsystem unlocks that tradeoff and makes the upcoming scan mini-game answerable to engineering's allocation, not just the player at the Signals seat.

## Scan as lock-and-hold (not a puzzle)

Signals locks onto a target and holds. Tiers unlock with time:
- faction at a glance,
- ship class after a few seconds,
- threat ID code with engineering's power behind it,
- hull weak vector when the pilot holds a steady aspect angle.

Hard maneuvers and broken sight lines drop the tier. The details live on the Signals console only — color tints can show on other radars, but the ID code and the weak vector are voiced or they don't exist. Gives Signals four cognitive modes (pattern-matching, optimizing, communicating, reacting), turns the pilot↔signals relationship two-way, and produces the per-fight numbers Weapons needs.

## Hack as coordination beat (not a typing test)

Once a target is scanned deep enough, hack becomes available — soften enemy weapons, engines, sensors, or reactor for thirty to sixty seconds. The action is short two-or-three-second code bursts, never absorbing. The skill lives in the *coordination*: engineering can power-dump on the mark for a multiplier, the pilot has to hold range, the captain picks which enemy system softens which of our problems. A successful hack is the Signals→Weapons→Pilot offensive cascade — the mirror of the Brace cascade running the other direction. The skill ceiling is *when and what*, not *how fast*. Resist making it a fast-typing mini-game (that's how EE got its comms islands).

---

## Proposed build order

1. Magazine reload (cheapest; cruise-phase cure for both quiet stations).
2. Dedicated `/signals` subsystem.
3. PDC + Brace.
4. Per-fight scanning numbers (now anchored by the armor/ammo decision).
5. Hack coordination beat.

Each step ships independently and moves at least one metric. Cumulative effect closes most of the gap to EE while leaving Starwards recognizably itself.
