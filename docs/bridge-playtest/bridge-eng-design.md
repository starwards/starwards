# Bridge Engineering — design intent (user-stated) and gap to current state

User-stated design for adding **damage management** to the bridge
engineering station, formalized into a specification, then compared to
current code and to existing planned tasks. Same pattern as
[signals-design.md](signals-design.md).

## 1. Design intent

### 1.0 Game format: LAN-party variant (coexists with LARP / IoT variant)

This design targets the **LAN-party / bridge-only** play format —
players at a table with screens and keyboards, novice-friendly,
self-contained on the bridge. It **does not replace** the planned
LARP / IoT repair station (#547); the two formats coexist, addressing
different game contexts:

| Format | Where repair happens | Mechanic | Status |
|---|---|---|---|
| **LAN party / bridge-only** (this spec) | On-screen, on the **bridge engineering** station | Keyboard / on-screen mental challenge per damage | New; to be designed |
| **LARP** ("Mission in the Fringe") | A **dedicated repair station** with IoT-driven physical props | Same archetype (per-damage minigame), but in physical form behind a network API | Tracked by **#547**; out of scope for the bridge playtest |

In the bridge-only playtest, repair is one of the systems "hardwired
for completeness" — present so the bridge experience feels whole,
not a focus of testing. The mechanic still needs to be playable
and legible enough that novices can engage with it.

### 1.1 Role addition

Today the bridge engineering station is a **systems-balancing seat** —
it manages power, coolant, heat, and warp frequency. The proposal adds a
second responsibility: **damage management** — the engineer should be
able to see what is broken on the ship, decide what to address first,
and execute repairs.

### 1.2 Player-facing capabilities

| # | Capability | Purpose |
|---|---|---|
| D1 | Damage report visible on engineering station | Engineer can see what is currently damaged or broken |
| D2 | Select a damaged system | Pick the next thing to repair |
| D3 | Decision-making before repairing | Engineer must choose between competing repairs (priority, severity, scarcity of resources / time) |
| D4 | Small mental challenge to execute repair | Repair is **not a single button-press**; it is a small skill / puzzle interaction at a "repair terminal" |
| D5 | Per-damage-type repair action | The action required at the repair terminal **correlates** with the specific damage report — the action depends on which system, which defectible, or the severity |

### 1.3 Repair loop (as described)

1. Damage occurs (existing combat / GM mechanism)
2. Damage report on engineering station updates — engineer sees the
   defects across systems
3. Engineer **decides** which to address (D3 — non-trivial choice,
   stated by user)
4. Engineer **selects** the damaged system (D2)
5. Engineer performs the **terminal action that corresponds to that
   damage** (D4 + D5)
6. On successful action, the defectible is restored toward its `normal`
   value (or, if completely broken, the system comes back online)

### 1.4 Open / unstated by user

The user explicitly framed parts of this as "maybe something like" or
"depending on … or something". The following are not pinned:

- The form of the mental challenge (pattern-match, sequence-input,
  rotary-tuning, sliding-puzzle, signal-trace, etc.)
- The mapping rule from damage → action: by **system type**? by
  **defectible name** ? by **severity**? combination?
- Whether multiple repairs can be queued or only one at a time
- Whether repairs consume resources (coolant, energy, spare parts)
- Whether repair is instant on success or has a duration
- Whether failed actions cost something (heat, time, partial regress)
- Whether the bridge engineer competes / coexists with the (future)
  ECR seat for repair authority — currently `/ecrControl` only gates
  power/coolant
- Whether this **replaces** or **complements** the planned standalone
  repair station (#547)

## 2. Current state in code (delta to intent)

### 2.1 Damage model — already in place

Source: `modules/core/src/ship/system.ts`, `damage-manager.ts`, and the
per-system files (`thruster.ts`, `chain-gun.ts`, `radar.ts`, `warp.ts`,
`reactor.ts`, `magazine.ts`, `maneuvering.ts`, `docking.ts`,
`smart-pilot.ts`).

- `@defectible({ normal, name })` decorator marks per-system properties
  that can be damaged. Examples in code:
  - `thruster.bearingSkew` (normal 0), `thruster.availableCapacity` (normal 1)
  - `chainGun.bearingSkew` (normal 0), `chainGun.rateOfFireFactor` (normal 1)
  - `warp.velocityFactor` (normal 1), `warp.damageFactor` (normal 0)
  - `radar.malfunctionRangeFactor` (normal 0)
  - `reactor.effeciencyFactor` (normal 1)
  - `maneuvering.efficiency` (normal 1)
  - `magazine.capacity` (normal 1)
  - `docking.rangesFactor` (normal 1)
- Reflection API (`getSystems()`) enumerates all defectibles with
  pointer + field + normal + current value.
- `system.getStatus()` returns `OK | DAMAGED | DISABLED`. `DAMAGED`
  means at least one defectible differs from `normal`. `DISABLED`
  means the per-system `broken` getter returns true (defectible past
  threshold).
- `DamageManager.damageSystem()` mutates defectibles probabilistically
  on combat hits, per-system. (No repair counterpart.)

### 2.2 Damage report widget — exists, but not on engineering

- `modules/browser/src/widgets/damage-report.tsx` already exists.
  Iterates every defectible across the ship, shows an animated Arwes-
  styled list with name + status, sorted by `alertTime` (most recent
  alert first).
- Registered on:
  - `screens/gm.ts` (GM dashboard)
  - `screens/ship.ts` (full-ship Dashboard mode)
- **Not** registered on `screens/ecr.ts` (the engineering / bridge-eng
  station).

### 2.3 What exists vs the user's capability list

| Capability | Today | Gap |
|---|---|---|
| D1 damage report on engineering station | 🟡 widget exists; not mounted on `ecr.ts` | mount it (and decide whether the existing Arwes-styled disappearing report is the right format for an action-oriented seat, or whether a static actionable list is needed) |
| D2 select a damaged system | ❌ no selection model on this screen | add selection state (and decide: free pick? must follow report order?) |
| D3 decision-making | 🟡 emergent in current widget — engineer sees a list, but with no cost or constraint, "decision" collapses to "do them all in parallel". Depends on D4/D5/resource model. | requires a constraint (one-at-a-time, resource cost, or time pressure) |
| D4 mental challenge | ❌ none — no repair UI exists at all | full design needed: form of challenge, success/failure semantics |
| D5 action correlated with damage type | ❌ no action concept exists | requires mapping table between (system, defectible, severity) → (action archetype) |
| repair effect on state | ❌ **no repair logic in code at all**. The ONLY restorative path today is the GM tweak panel writing the value back to `normal`. | server-side command `repairDefectible(systemPointer, field)` (or similar) that resets the defectible — needs design re: instant vs gradual, success/fail effect |

### 2.4 Adjacent UI already on engineering

The current engineering screen (`screens/ecr.ts`) already shows:

- `fullSystemsStatus` middle-panel — per-system row with Status / Power
  / EPM / Heat / Coolant / Hacked, **plus** per-defectible drag-slider
  rows. The slider lets you scrub a defectible value in real time —
  effectively a manual repair tool, but it is not gated, has no
  challenge, and writes directly via `addBarCellToRow`.

This means: **a back-door manual repair already works on this screen
via the defectible sliders**. There is no skill challenge gating it,
and the engineer has no in-fiction reason not to drag every slider
back to `normal` immediately. The user's proposal would either replace
or gate this back-door.

## 3. Comparison with existing planned tasks

### 3.1 Tickets touching this area

| Ticket | Status | Relation to user intent |
|---|---|---|
| #1228 malfunction API | ✅ closed | Built the `@defectible` annotation infrastructure that the user's repair UI would consume. Ticket body explicitly listed "logic / measurement for fixing damage? (for future repair station, #547)" — i.e., the foundation was laid for #547 but never used. |
| #1232 (referenced by #1233) | not in repo | Predecessor that introduced the damage-report widget. |
| #1233 add broken status to damage-report widget | ✅ closed (PR #1974) | `damage-report.tsx` now surfaces broken systems via `getBrokenSystems` alongside defectibles. Compatible with the user's D1 — would land naturally as part of the engineering-station mount. |
| #547 repair station | ❌ open (was blocked by #1228, now unblocked) | **Direct overlap with user intent.** Ticket text: *"repair widgets / minigames. preferably behind a network API (IoT?)."* The ticket assumes a **separate** ship station; user is proposing to put repair on the **bridge engineering** station instead. |
| #543 Fighters field repair | ✅ closed (2026-04-13) | Different scope (fighters, GM-button-press). Not relevant to the bridge proposal. |
| #545 Fighters in-station repair | ✅ closed (2026-04-13) | Different scope. Not relevant. |
| #549 Collection of damaged ships | ✅ closed (2026-04-13) | Adjacent — assumes ships return to a station to be repaired. |

### 3.2 Relationship to #547 (LARP repair station): coexistence

The user's proposal and the existing #547 ticket share the *mechanic
archetype* (per-damage minigame that restores a system) but target
**different game formats** — they are siblings, not alternatives.

| Aspect | **#547 — LARP / IoT repair station** | **This spec — LAN-party bridge-eng repair** |
|---|---|---|
| Game format | LARP "Mission in the Fringe" event | LAN-party / bridge-only playtest |
| Where it runs | A **new dedicated ship station** with physical props | The **existing bridge engineering** station, on screen |
| Connectivity | Behind a network API (IoT) | Keyboard + on-screen |
| Mechanic | Per-damage minigame in physical form | Per-damage mental challenge in on-screen form |
| Decision-making | Not described in #547 | Explicitly part of D3 |
| Roadmap slot | MS3 PLAN Phase 4 (post-stations, IoT) | Bridge playtest scope (now) |
| Relation | The two share the action-to-damage **mapping table** and the underlying server-side `repair*` command(s) wherever possible | |

**Implication for shared building blocks:** Whatever
action-to-damage mapping (D5) and repair-command surface get
designed for the LAN-party variant should be reusable by the
LARP/IoT variant when #547 is built. Avoid coupling the mapping
or commands to keyboard input semantics so the IoT variant can
plug into the same server-side primitives.

### 3.3 Other unresolved decisions (user-silent items, listed for completeness)

- **Replace the defectible drag-sliders in `fullSystemsStatus` or
  leave them in?** They are effectively a no-skill back-door repair.
- **Action mapping rule:** by system type (each system gets one
  archetype puzzle), by defectible name (each defectible has its own
  puzzle), or by severity tier (small fix vs major fix puzzles)?
- **Does broken (`DISABLED`) require a different / harder action than
  damaged (`DAMAGED`)?** D5 wording suggests yes ("severity").
- **Time / resource cost** of attempting a repair, and of failing.
- **Authority sharing with future ECR seat.** `/ecrControl` currently
  only gates power/coolant; should it also gate who can repair?
- **Does `damage-report.tsx`'s Arwes-themed disappearing-text format
  fit an action-oriented seat?** It is currently designed as a
  read-only alert log (defects animate in and disappear after acked),
  not a list-with-actions.

## 4. Game-readiness summary

Against the user's stated intent, today the bridge engineering station
delivers:

- **D1 partially** — the damage-report widget exists in the codebase
  but is not mounted on `ecr.ts`. The closest thing on the engineering
  screen is the per-defectible row inside `fullSystemsStatus`.
- **D2 / D3 / D4 / D5 entirely missing** — no selection model, no
  decision-forcing constraint, no challenge mechanic, no
  action-to-damage mapping, no repair command.

The data foundation (`@defectible` reflection, per-system damage
handlers, status enum) is in place. The **player-facing repair
mechanic is the gap** — both the UI and the server command.

A bridge playtest where engineering is supposed to "do damage
management" today resolves to: the engineer sees broken systems on
the systems table, drags the defectible slider back to normal in
`fullSystemsStatus`, and that's it. There is no skill-test, no
prioritization pressure, no failure mode.

## 5. Tickets relevant to closing the gap

- **#1233** ✅ closed (PR #1974) — `broken` status now surfaced in the
  damage-report widget.
- **#547** open (now unblocked) — central decision: keep as a
  separate post-bridge station, or re-scope onto bridge engineering.
- New ticket(s) likely needed for:
  - Mount damage-report on `ecr.ts` (and decide format)
  - Repair-command server side (`repairDefectible(...)`) + tests
  - Repair-terminal UI / mini-game (depends on chosen mechanic)
  - Action-to-damage mapping table
  - Optionally: gate the `fullSystemsStatus` defectible sliders
