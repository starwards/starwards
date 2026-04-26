# Bridge Interdependency Matrix — principle and current state

User-stated foundational design principle, formalized, with a factual
mapping of the current matrix in code across the four bridge stations
(pilot, weapons, bridge engineering, signals).

## 1. Principle (user-stated)

> "A fundamental design principle … is the matrix of interdependencies
> between the stations. It should be laid out like a complex
> rock-paper-scissors game where every station is dependent on others
> for its effectiveness, and supplies necessary information or actions
> for other stations. We need this matrix to be interesting enough for
> the game to have real teamwork substance. And on top of that, there's
> a layer of communicating in the physical room and optimizing the
> signal-to-noise ratio."

Two layers:

- **State / mechanics layer** — what each station's actions and resource
  consumption do to other stations' effectiveness, and what information
  each station needs from others to act well.
- **Physical communication layer** — the verbal coordination required
  between players in the room. Signal-to-noise is part of the skill.

## 2. Today's matrix in code (state layer)

Rows = "this station depends on …", Columns = "… for what".
Entries are taken from current code; opinions/aspirations excluded.

### 2.1 Shared mechanisms that drive interdependence

These three mechanisms are where the matrix actually lives in code:

- **Power × Hacked × (1 − broken) → effectiveness** (`system.ts:99`).
  Every system's effectiveness is a function of inputs the engineer
  controls. If the engineer cuts power to `radar`, every radar-using
  station goes blind together.
- **Coolant is finite, distributed by `coolantFactor` ratios**
  (`heat-manager.ts:34-51`). Total coolant comes from
  `design.totalCoolant` and is split across systems by the engineer's
  per-system `coolantFactor`. **Allocating coolant to one system
  starves another.** Engineer cannot give every system enough.
- **Energy spend → heat → damage** (`energy-manager.ts:36-38` →
  `heat-manager.ts:14-20`). Spending energy above a per-system
  threshold adds heat. Heat above `MAX_SYSTEM_HEAT` calls
  `damageManager.damageSystem` — the system literally breaks itself.
  This couples *station activity* (firing, scanning, warping) to the
  engineer's coolant decisions.

### 2.2 Station-by-station: who depends on whom

| Station | Depends on … | For … | Code reference |
|---|---|---|---|
| **Pilot** | Engineering | power for `/thrusters/*`, `/warp`, `/maneuvering`, `/smartPilot`, `/radar` | `pilot.ts:56-63` (systems-status filter) |
| Pilot | Engineering | warp **frequency** (only ECR can change) | `ecr.ts:124-137` |
| Pilot | Signals | scan-level gating on pilot-radar — same-faction always BASIC, others UFO until scanned | `fc54991` (#1205) |
| **Weapons** | Engineering | power for `/chainGun`, `/tubes/*`, `/magazine`, `/radar` | `weapons.ts:55-60` |
| Weapons | Engineering | coolant — chaingun fires generate heat (energy spend → heat) | `energy-manager.ts:36-38` |
| Weapons | Pilot | ship orientation — must be pointed roughly at target to hit | implicit; tactical-radar shows crosshairs from `chainGun` |
| Weapons | Signals | scan-level gating on tactical-radar (UFO ships render as gray, no model) | `fc54991` (#1205) |
| **Bridge Eng** | Pilot | combat exposure → damage → engineering's job to manage | `damage-manager.ts:37-54` |
| Bridge Eng | Weapons | weapons activity → energy spend → heat → potential overheat damage | `energy-manager.ts:36-38` |
| Bridge Eng | (ECR seat, optional) | warp-frequency authority via `/ecrControl` | `ecr.ts:142-145` |
| **Signals** | Engineering | power for `/radar` (the **only** subsystem signals filters in its systems-status — there is **no separate "signals" subsystem class**) | `signals.ts:57-60`; `core/src/ship/` has no `signals.ts` |

### 2.3 What each station supplies *to* others

| Station | Supplies | To | How |
|---|---|---|---|
| Pilot | Position, heading, velocity | Everyone | implicit via space state |
| Pilot | Warp level (range / frequency-tuned travel) | Everyone | `/warp` state |
| Weapons | None directly to friendly stations (target effects are on enemies) | — | — |
| Bridge Eng | Power level per system | Every other station | `/{system}/power` |
| Bridge Eng | Coolant allocation per system | Every other station | `/{system}/coolantFactor` |
| Bridge Eng | (ECR) warp frequency | Pilot (range / hazards) | `/warp/standbyFrequency` |
| Signals | Scan level on space objects (per faction) | Pilot/Weapons radars | `/Spaceship/{id}/scanLevels` |
| Signals | Hack effect (planned) on enemy systems | Weapons (easier targets) | `/{enemy}/{system}/hacked` (effect side shipped #1207) |

### 2.4 The matrix as a graph

In rough adjacency form, ignoring strength:

```
                        ┌──────── power, coolant, frequency ───────┐
                        │                                          ▼
                  Bridge Eng ◄──── damage, heat ─── Pilot ─── orientation ─► Weapons
                        ▲                            │                       │
                        │                            │                       │
                        └──── damage, heat ──── Weapons                      │
                                                                             │
                           Signals ─── scan level ───► Pilot/Weapons radars  │
                              ▲                                              │
                              │                                              │
                              └────── (intel for "what to engage") ──────────┘
```

## 3. Where the matrix is strong / weak today

**Strong (real two-way dependencies present in code):**

- **Engineering ↔ everyone** — power and coolant are genuinely
  contested resources (finite total coolant, finite reactor energy).
  Engineer's choices visibly degrade or boost every other seat.
- **Engineering ↔ Weapons / Pilot via the heat → damage loop** —
  firing or warping aggressively without engineer support causes
  real self-damage.

**Weak / one-way today:**

- **Signals → Weapons** is the only intel pipe to weapons, and
  today scan level is **GM-controlled**. Until #1206 (signals jobs)
  ships, signals can't actually *do* anything to upgrade scan level
  — so the supply side of "signals supplies intel to weapons" is
  inert. From weapons' perspective, scan level just exists.
- **Signals ↔ Engineering** — signals depends on `/radar` power
  (shared with pilot/weapons, not its own subsystem). There is **no
  `Signals` system class** in core. Engineer cannot up-power signals
  without also up-powering pilot/weapons radar. This collapses what
  could be a tradeoff into a single shared dial.
- **Weapons → friendly stations** — weapons supplies essentially
  nothing back to its own bridge. (Successful kills reduce future
  damage, but that's indirect.) The matrix is asymmetric here.
- **Pilot → Signals / Weapons** — pilot supplies position implicitly
  but has no explicit "tell signals what to scan" or "tell weapons
  to ready" channel. Coordination is verbal only (which is consistent
  with the comms layer principle, but worth flagging).

**Not yet in code at all:**

- **Track** (#1206 design) would make signals supply persistent-
  visibility intel to pilot/weapons — currently absent.
- **Cyber attack initiation** by signals (effect side shipped via
  #1207, init side not) would let signals supply "softened targets"
  to weapons — currently absent.
- **Damage report → engineer repair action** would close the loop
  where pilot/weapons taking damage creates work the engineer must
  prioritize via mini-game (LAN-party variant) — see
  `bridge-eng-design.md`. Today the report exists but the loop has
  no skill-test.

## 3a. The Captain role (no station, no UI)

The bridge crew includes a **floating Captain role** with no station
and no screen. The role is **derived implicitly** from the design
above: each station has a deliberately partial view of the situation
and is focused on its own narrow tasks. The captain fills the void of
**overall awareness and orchestration** — they are the human exemplar
of the comms-layer principle.

**The captain's existence is a *consequence* of partial views, not a
feature added on top.** This means:

- The per-station information filtering documented in §3 is
  **load-bearing** for the captain's role. Examples in current code
  that enable the captain:
  - `systemsStatus` is filtered per station (`pilot.ts:56-63`,
    `weapons.ts:55-60`, `signals.ts:57-60`) — only engineering sees
    the full systems table
  - Signals' independent `SelectionContainer` (vs `weaponsTarget`)
    means signals' "what I'm looking at" is never automatically
    shown to weapons
  - Warp frequency lives only on engineering screens — pilot cannot
    see it
- Designs that surface global state to any single station — a
  "captain dashboard", a "show everything to the pilot" overlay,
  auto-routing of signals' target to weapons — would **dissolve the
  captain's reason to exist**.
- The captain is enabled by **physical presence in the room**
  (walking between screens, listening to handoffs). This makes the
  captain the human embodiment of the signal-to-noise layer in §4.

In the upcoming session shape (5 people, 4 stations, **Captain
floats**, Relay removed), the captain has no UI to speak of and
their effectiveness depends entirely on the partial-views matrix
holding up.

## 4. Communication layer (state of play)

What the user describes — verbal coordination as a first-class
design surface — is not directly enforceable in code. Today's bridge
already requires several verbal handoffs even with the thin matrix:

- **Engineer ↔ everyone**: "I'm cutting your power for 30s",
  "weapons is overheating, ease off"
- **Pilot ↔ Weapons**: "rolling left, hold fire", "target on bearing"
- **Signals ↔ Weapons**: "the lead ship is a corvette, weapons-down,
  shoot it first" — but this only works once #1206 lands; today
  signals can't actually identify the lead ship without GM help

Things in code that **dampen** comms (move information automatically
where it could be a verbal handoff):

- `weaponsTarget` is a single state field — once weapons cycles to a
  target, signals' panel does not need a verbal handoff to know what
  weapons is engaging (signals has its own independent
  `SelectionContainer`, but it could read `weaponsTarget` and skip
  the conversation). Today they are **independent**, which is good
  for forcing verbal sync but bad if players assume they're linked.
- `systemsStatus` filters per station — each station only sees its
  own subsystems. Engineering sees the full table. Pilot/Weapons
  cannot see if their systems are about to overheat unless engineering
  tells them. **Currently this enforces verbal comms.** A future
  "show heat warning to pilot" affordance would be a comms-dampener.

Things in code that **amplify** comms (force players to talk):

- Signals' independent `SelectionContainer` (vs `weaponsTarget`) —
  signals must say "the one I'm looking at is the destroyer".
- ECR's `/ecrControl` toggle — only one engineer holds power/coolant
  authority at a time; the bridge engineer and ECR must coordinate
  who's driving.
- Warp frequency lives only on engineering screens — pilot literally
  cannot see the current frequency. Pilot must ask.

## 5. How current proposals interact with the matrix

### 5.1 Signals mini-game (`signals-design.md`)

- **Strengthens Signals → Weapons** (the central weak link). Once
  signals can actively scan and reveal model + intel, weapons gains
  a real reason to ask "what is that?" before engaging. Verbal
  handoff "the destroyer is at bearing 030, hack its weapons first"
  becomes possible.
- **Strengthens Signals → Engineering** if scanning consumes power
  / heat in the radar (or in a new signals subsystem) — engineer
  must allocate.
- **Decision needed (user not yet resolved):** does scanning use
  the existing `/radar` system or a new `/signals` system? A new
  subsystem would give engineering a real allocation choice;
  reusing radar shares fate with pilot/weapons radars.

### 5.2 Bridge-eng damage management (`bridge-eng-design.md`)

- **Strengthens Pilot/Weapons → Engineering** by making damage
  visible and requiring active player work to repair. Today damage
  is engineer-invisible-then-suddenly-broken; with a damage report
  + mini-game, damage becomes a concrete workload.
- **Strengthens the comms layer** if pilot/weapons can't see their
  own defectibles (currently they can't — only engineering shows
  defectibles), engineer must verbally explain what's broken
  and how long the repair will take.
- **Risk to the matrix:** if the on-screen mini-game is so
  absorbing that the engineer stops attending to power/coolant,
  the existing engineering ↔ rest-of-bridge loop weakens. Worth
  watching in playtest.

### 5.3 Captain-role implications

For each in-flight proposal, also ask: does this **strengthen or
dissolve the captain's role**?

- **Signals mini-game + scan tiers** (#1899/#1900): strengthens —
  it adds intel that exists at signals but not elsewhere; the
  captain can route "scan that one first" decisions
- **Bridge-eng repair menu** (#1898): strengthens — engineer's
  workload becomes a real input the captain must triage against
  pilot/weapons priorities
- **Signal-owned waypoints** (#1893, replacing the cut Relay):
  unclear — depends on whether waypoints are visible to the pilot.
  If pilot sees waypoints automatically, the signal→pilot handoff
  bypasses the captain. If pilot must be *told* a waypoint was
  added, the captain's orchestration role is preserved.

## 6. Open / unresolved (user-silent items, listed for completeness)

- Whether to introduce a dedicated `Signals` subsystem class
  (vs sharing `/radar`) — the matrix-strength argument leans one
  way, the simplicity argument leans the other.
- Whether weapons should supply *anything* back to its bridge —
  the current asymmetry leaves weapons as a sink.
- Whether pilot needs a visible engineering-style status (heat
  warning, low-power alert) or whether keeping that info engineering-
  only is the desired comms-amplifier.
- Whether the warp-frequency ECR/Bridge split is a comms feature
  or a bug — today the bridge engineer cannot change frequency,
  only ECR can; this forces a verbal handoff but only matters if
  ECR is staffed.
