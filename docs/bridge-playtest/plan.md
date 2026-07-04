# Bridge MVP — Task Plan

Concrete task breakdown for the next milestone, derived from [`decisions.md`](decisions.md). Three parallel tracks:

- **[D]** = Daniel designs (armor / ammo)
- **[U]** = User designs (damage control / scan beam control / closed-transponder cost)
- **[C]** = Claude executes (straightforward, agent-ready once spec'd)

For deferred ideas, see [`proposals.md`](proposals.md).

---

## Track A — Daniel-designed (armor + ammo)

| ID | Task | Blocked on |
|---|---|---|
| A1 **[D]** | Armor plate types: names, properties, visual identity | — |
| A2 **[D]** | Ammo types (missiles + cannon shells): names, properties | — |
| A3 **[D]** | Full armor × ammo damage matrix | A1 + A2 |
| A4 **[D]** | Per-ammo heat-per-shot values | A2 |
| A5 **[D]** | Per-ammo magazine capacity rules (per-ship-design) | A2 |

Output: design spec docs in `docs/bridge-playtest/`.

---

## Track B — User-designed

| ID | Task | Blocked on |
|---|---|---|
| B1 **[U]** | Scan beam control: shape (continuous slider vs presets), orientation (fixed / gimbal / auto-track), how Signals operator picks shape, fail-on-leave UX | — |
| B2 **[U]** | Tier-2 snapshot output: data fields, presentation, voice-only vs auto-propagate | B1 |
| B3 **[U]** | Engineering operations queue UX: queue order/priority, parallelism, cancel/resume, malfunction list display | — |
| B4 **[U]** | Repair protocol catalog: count, coverage profile per protocol, cost per protocol | B3 |
| B5 **[U]** | Closed-transponder cost (comms? dock? friendly auto-routing?) | — |
| B6 **[U]** | Armor `healRate`: keep / remove / move under repair protocol | — |
| B7 **[U]** | Tier-1 timer reset rule on radar re-entry (reset / pause / persist) | — |
| B8 **[U]** | Drop `B`/`V` cycle keys or keep with `Shift` reverse | — |

Output: design notes captured to `docs/bridge-playtest/`.

---

## Track C — Claude executes

### Group C1 — independent, ready to start

| ID | Task | GitHub |
|---|---|---|
| C1.1 **[C]** | Wire `addHeat()` calls into chain-gun + missile firing path (placeholder per-ammo values) | [#1923](https://github.com/starwards/starwards/issues/1923) |
| ~~C1.2~~ | ~~Add `callsign` + `transponderOpen` fields to `Spaceship`, default open~~ — **done** (merged via #1927) | [#1924](https://github.com/starwards/starwards/issues/1924) |
| C1.3 **[C]** | 5-second in-range timer for ScanLevel.UFO→BASIC promotion; gate on `transponderOpen` | [#1925](https://github.com/starwards/starwards/issues/1925) |
| ~~C1.4~~ | ~~Ammo selection UI audit~~ — **done** (resolved by screenshot review on 2026-05-03) | — |

### Group C2 — needs Daniel (Track A)

| ID | Task | Blocked on |
|---|---|---|
| C2.1 **[C]** | `ArmorType` enum + per-plate type assignment in schema and `make-ship-state.ts` | A1 |
| C2.2 **[C]** | Add new ammo types to `projectileDesigns`, `Magazine` (`max_*`/`count_*`), `chain-gun` (`use_*`) | A2 |
| C2.3 **[C]** | Armor-type-aware damage matrix in `damage-manager.ts` | A1 + A2 + A3 |
| C2.4 **[C]** | Per-ammo heat values from A4 wired into C1.1 | A4 + C1.1 |
| C2.5 **[C]** | Magazine capacity per A5 | A5 |
| C2.6 **[C]** | Cycle UI improvements (persistent strip, magazine counts, next-preview, optional `Shift+B` / `Shift+V` reverse) | A2 |

### Group C3 — needs User (Track B)

| ID | Task | Blocked on |
|---|---|---|
| C3.1 **[C]** | Beam-geometry primitive + in-beam check | B1 |
| C3.2 **[C]** | Refactor `signals-job-manager.ts` scan branch: probabilistic → geometric lock-and-hold; freeze hack branch unchanged | B1 + C3.1 |
| C3.3 **[C]** | Snapshot data structure (full target design + state) | B2 |
| C3.4 **[C]** | Snapshot consumer wiring (Signals widget + tactical/weapons radar tints) | B2 + C3.3 |
| C3.5 **[C]** | Repair execution engine (queue runtime + resource consumption + malfunction-clear) | B3 |
| C3.6 **[C]** | Repair protocol catalog data + lookup | B4 + C3.5 |
| C3.7 **[C]** | Engineering operations queue UI | B3 + C3.5 |
| C3.8 **[C]** | Closed-transponder cost wiring | B5 + C1.2 |

---

## Recommended kickoff (parallel-friendly)

**Right now, in parallel:**
- **You** draft B1, B3 (most blocking). Cheap small ones any time: B5, B6, B7, B8.
- **Daniel** drafts A1, A2 (most blocking).
- **Claude** executes C1.1, C1.3 — all agent-ready, can run in parallel.

**Second wave (after B1/B3/A1/A2 land):**
- Claude executes C3.1+C3.2 (scan geometry), C3.5 (repair engine), C2.1+C2.2 (armor + missile types).
- Daniel works on A3, A4, A5.
- You work on B2, B4.

**Third wave:**
- Claude integrates: C2.3, C2.4, C2.6, C3.3, C3.4, C3.6, C3.7, C3.8.
- Tuning + playtest.

---

## Cross-cutting notes

- **Per-ship-design ammo loadout** — confirmed 2026-05-03. Cycling stays in the weapons UI (direct-bind dropped).
- **Heat infra is live.** C1.1 is two function calls; the rest of the chain works today.
- **Repair logic is greenfield.** No repair code exists for system damage. C3.5 is the largest single-feature cost in the milestone.
- **Tier-2 scan is a partial rewrite.** Existing `signals-job-manager.ts` is probabilistic + range-based; new spec is deterministic + geometric. Hack branch is co-located but out of milestone scope — leave behaviour intact.
- **`projectileDesigns` is hard-coded.** Adding new ammo types touches chain-gun, magazine, projectile, damage-manager, and ship configs together. Expect bugs at the seams.
