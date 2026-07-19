# Bridge Design Decisions

Confirmed decisions only. Candidates and drafts live in [`proposals.md`](proposals.md).

## 2026-07-04 — Next-step priorities

Agreed order of upcoming work (Amir + Daniel, 2026-07-04):

1. **Merge the ammo-type × armor-type damage metrics.** Land the new per-pair damage mechanic (see the 2026-05-03 armor×ammo decision below). Daniel's concrete draft is [#1929](https://github.com/starwards/starwards/issues/1929) (5 armor types × 8 ammo types, full damage matrix); implementation is pending in [PR #1932](https://github.com/starwards/starwards/pull/1932). Merging that PR is the immediate next step.
2. **Design the player ship — the corvette (Gravitas).** Make it interesting and durable for play: it must survive and stay engaging across a full session, not just a dogfight.
3. **Add the Signals radar beam.** The directional beam at the Signals station (see the tier-2 EW scan beam in the 2026-05-03 scan-tiers decision below).

Future features discussed in the same talk (probes, railgun, torpedo) are drafted in [`proposals.md`](proposals.md), not committed to this milestone.

**Open design issues.** Two questions remain unresolved after the priorities above:

1. **Ship kill condition — how do you destroy a ship?** What ends a ship in play? Needs to be reconciled with the standing "malfunction over destruction" philosophy (ships never auto-explode; TPK is a GM decision — see [`../design/mechanics/armor-and-damage.md`](../design/mechanics/armor-and-damage.md)). With durable player ships (the Gravitas corvette) and the new ammo×armor damage model, the win/loss condition of combat needs an explicit design.
2. **Weapons officer and multiple PDCs — controlling or managing?** If the ship carries several PDCs, what is the weapons officer's game experience? Directly aiming/firing one at a time vs. a management layer (assigning targets/arcs/priorities to semi-autonomous mounts). Relates to the PDC + Brace cascade proposal in [`proposals.md`](proposals.md) (currently out of MVP scope per the 2026-05-03 scope decision).

**Status.** Priorities agreed (Daniel, 2026-07-04). The two design issues above are open — no direction chosen yet.

## 2026-05-03 — MVP scope (next milestone)

**In scope.** Only items confirmed in this file.

**Out of scope (kept in `proposals.md` for the future, not the next milestone):**
- PDC + Brace cascade
- Magazine reload as Engineering allocation
- Hack as coordination beat
- Dedicated `/signals` (EW) subsystem split from radar power
- Tier 3+ scan

## 2026-05-03 — Armor types × ammo types as the per-fight Signals→Weapons handoff

**Decision.** Add variety in armor types and ammo types. Matching the right ammo for a target's armor becomes the per-encounter information dependency that EE gets from shield frequencies.

**Role implications.**
- **Signals**: scans the target, identifies armor type, voices it to Weapons.
- **Weapons**: receives the call, selects matching ammo, fires.
- Replaces the "shield frequency equivalent" slot in the gap-closing plan.

**Counts.** Multiple armor types and multiple ammo types (missiles + cannon shells). Concrete counts owned by Daniel — draft landed as [#1929](https://github.com/starwards/starwards/issues/1929) (5 armor types, 8 ammo types, Resist/Normal/Vulnerable/Critical/Ignores matrix). Intent: asymmetric ammo↔armor mapping (no clean 1:1) so some ammo is strong vs. multiple armors and weak vs. others, forcing real Weapons judgment rather than lookup.

**Status.** Direction agreed (Daniel, 2026-05-03). Open: full per-pair damage matrix, partial-match curve shape, per-ammo magazine slot allocation, in-flight reload swap rules.

## 2026-05-03 — Scan tiers: transponder + EW beam

**Tier 1 — transponder read.** Passive read of the target's transponder. Reveals **faction, ship class, callsign**. Automatic on all radars (Pilot, Weapons, GM, Signals); no Signals action required.
- **Transponder state is fixed by ship type, not a player lever** (2026-07-19): fighting ships have their transponder closed; civilian ships (out of scope for now) have it open. Nobody opens/closes a transponder during play.
- **Promotion takes 5 seconds.** A contact enters radar range as `ScanLevel.UFO` (0). After **5 seconds of continuous time in radar range** (with transponder open), it auto-promotes to `ScanLevel.BASIC` (1). The delay adds suspense — the bridge sees an unknown contact for several seconds before identification.
- Leaving and re-entering radar range presumably resets the timer (TBD).
- Closed transponder → contact never auto-promotes past UFO; tier 1 then requires an active scan.

**Tier 2 — active EW scan.** Reveals the target's **full design and state** — everything the target ship is and everything its current values are at the moment of scan (armor type and cover, weapons, subsystems, power/heat levels, malfunctions, ammo, etc.). Performed via a dedicated **EW scan beam**.
- **Snapshot, not live.** Scan captures state at the moment of completion. Subsequent changes (armor damaged, weapons swapped, system broken, ammo expended, etc.) do not update the cached scan — a rescan is required.
- Beam shape is a tradeoff: narrow + long range ↔ wide + short range. Signals operator picks the shape.
- Workflow: Signals selects a target inside the beam → triggers a tier-2 scan task → completes after X seconds.
- Lock condition: target must be inside the beam at trigger time.
- Failure: target leaves the beam → task fails immediately (no pause / no resume).
- Pilot↔Signals coupling: pilot's heading and range determine whether the lock holds.
- The scan beam is part of the ship's **Electronic Warfare (EW)** system. EW emissions are active and detectable — scanning reveals the scanner. EW likely groups scan, jamming, ECM, and hack under a shared chassis (power, heat, antenna).
- **Forward-looking — abstract boundary.** Like the Engineering operations queue, the Signals scan queue is a relay seam: today Signals both triggers and "executes" tasks (they resolve over time on the operator's station). Later these tasks may be dispatched to other players (e.g. EW-room crew, dedicated scan/jam operators) who actually perform them.

**Tier 3+.** **Out of scope for MVP.** Scan system ships with tier 1 and tier 2 only. Tier 3+ may return later but is not part of the current bridge build.

**Status.** Direction agreed (Daniel, 2026-05-03). Open: beam orientation (fixed / gimballed / auto-track), parallel scans, failure cooldown, X-duration formula, jamming as Signals vs Engineering, antenna sharing with radar.

## 2026-05-03 — Weapons fire generates heat (DPS limiter, Engineering coupling)

**Decision.** Firing weapons produces **significant heat in the weapon subsystem**. Heat is the primary DPS limiter — sustained fire forces a cooldown beat or risks self-damage.

**Chain.** `fire → heat → (if unchecked) overheat damage → malfunction`. Reuses the existing heat→damage→malfunction infrastructure (`HeatManager.addHeat`, overheat damages the system above `MAX_SYSTEM_HEAT = 100`, which then becomes broken/malfunctioning). Today `chain-gun.ts` does not call `addHeat`; this decision adds that call (and an analogous one for missiles).

**Per-shot heat values.** Should differ by ammo type — heavier rounds run hotter. Specific values TBD.

**Cross-station effects.**
- **Engineering↔Weapons coupling tightens.** Engineer must allocate coolant to the weapons subsystem during sustained engagements; trade against allocations to reactor, EW, etc.
- **Captain decision.** Push DPS into the red and accept incoming malfunctions, or pace fire and conserve weapon health.
- **Repair-protocol consumer.** Weapon malfunctions become a recurring item in the Engineering operations queue — connects to the damage-control decision below.

**Status.** Direction agreed (Daniel, 2026-05-03). Open: per-ammo heat values, whether PDC has its own heat track, coolant priority defaults, "soft cap" warning thresholds in the UI.

## 2026-05-03 — Engineering damage control: operations queue + repair protocols

**Decision.** Engineering owns **damage control**. The station has an **operations queue** where the engineer enqueues **technical operations**. Initially these are **repair protocols**, but the queue is general-purpose — other interesting operations may be added later.

**Repair protocols.**
- Multiple protocols exist; each is **good for different types of malfunctions**.
- Each protocol consumes a different mix of resources: **time, energy, heat** (and possibly others).
- No protocol covers everything well. The mini-game is **picking the protocol(s) that cover the most malfunctions for the lowest total cost** — given the current malfunction set, current power/heat headroom, and the captain's pressure to be ready.

**Game shape.**
- Engineer reads the malfunction list, picks a protocol from a catalog, enqueues it.
- Operations queue runs sequentially (or with limited parallelism — TBD).
- Optimization play: protocol selection, ordering, and timing relative to combat phase.

**Current state of the codebase (context for this decision).**
- Damage and malfunctions are **only added** today — no repair code exists for system damage or broken systems.
- Armor plates are the lone exception: passive auto-heal via `healRate`, no operator action.
- This decision adds the missing repair side of the damage loop.

**Same task-queue shape as Signals tier-2 scan** — the bridge gets a consistent "operator picks an operation, station executes it over time" idiom.

**This is the LAN-party variant.** LARP variant remains the IoT repair station #547.

**Forward-looking — abstract boundary.** For now, Engineering both decides and "executes" the queued operations (the queue resolves itself over time). Later, this boundary becomes a **relay point**: queued operations get dispatched to other players (e.g. Repair-station crew, damage-control team) who actually perform them. Today's queue API is the seam where that handoff will plug in.

**Status.** Direction agreed (Daniel, 2026-05-03). Open: protocol catalog contents, per-protocol coverage matrix (which malfunctions each protocol addresses and how well), per-protocol resource cost shape, queue parallelism, malfunction generation rules during combat, integration with the existing damage-report widget.
