# Bridge MVP — Task Plan

Concrete task breakdown for the next milestone, derived from [`decisions.md`](decisions.md). Three parallel tracks:

- **[D]** = Daniel designs (armor / ammo)
- **[U]** = User designs (damage control / scan beam control / closed-transponder cost)
- **[C]** = Claude executes (straightforward, agent-ready once spec'd)

For deferred ideas, see [`proposals.md`](proposals.md).

---

## Track A — Daniel-designed (armor + ammo)

| ID         | Task                                                     | Blocked on |
| ---------- | -------------------------------------------------------- | ---------- |
| ~~A1~~     | ~~Armor plate types: names, properties, visual identity~~ — **done** (shipped via PR #1932, 2026-07; 5 armor models in `armor-models.ts`)         | —          |
| ~~A2~~     | ~~Ammo types (missiles + cannon shells): names, properties~~ — **done** (shipped via PR #1932, 2026-07; 3 shells + 6 missiles in `projectile.ts`) | —          |
| ~~A3~~     | ~~Full armor × ammo damage matrix~~ — **done** (shipped via PR #1932, 2026-07; resolved per-layer in `damage-manager.ts`)                         | —          |
| ~~A4~~     | ~~Per-ammo heat-per-shot values~~ — **done** (shipped via PR #1932, 2026-07; `heatPerShot` per ammo design)                                       | —          |
| ~~A5~~     | ~~Per-ammo magazine capacity rules (per-ship-design)~~ — **done** (shipped via PR #1932, 2026-07; `max_*` fields in `magazine.ts`)                | —          |

Output: design spec docs in `docs/bridge-playtest/`.

---

## Track B — User-designed

| ID         | Task                                                                                                                                                   | Blocked on |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| B1 **[U]** | Scan beam control: shape (continuous slider vs presets), orientation (fixed / gimbal / auto-track), how Signals operator picks shape, fail-on-leave UX | —          |
| B2 **[U]** | Tier-2 snapshot output: data fields, presentation, voice-only vs auto-propagate                                                                        | B1         |
| B3 **[U]** | Engineering operations queue UX: queue order/priority, parallelism, cancel/resume, malfunction list display                                            | —          |
| B4 **[U]** | Repair protocol catalog: count, coverage profile per protocol, cost per protocol                                                                       | B3         |
| B5 **[U]** | Closed-transponder cost (comms? dock? friendly auto-routing?)                                                                                          | —          |
| B7 **[U]** | Tier-1 timer reset rule on radar re-entry (reset / pause / persist)                                                                                    | —          |
| B8 **[U]** | Drop `B`/`V` cycle keys or keep with `Shift` reverse                                                                                                   | —          |

Output: design notes captured to `docs/bridge-playtest/`.

---

## Track C — Claude executes

### Group C1 — independent, ready to start

| ID           | Task                                                                                                     | GitHub                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ~~C1.1~~     | ~~Wire `addHeat()` calls into chain-gun + missile firing path~~ — **done** (merged via #1930)            | [#1923](https://github.com/starwards/starwards/issues/1923) |
| ~~C1.2~~     | ~~Add `callsign` + `transponderOpen` fields to `Spaceship`, default open~~ — **done** (merged via #1927) | [#1924](https://github.com/starwards/starwards/issues/1924) |
| ~~C1.3~~     | ~~5-second in-range timer for ScanLevel.UFO→BASIC promotion; gate on `transponderOpen`~~ — **done** (merged via #1933) | [#1925](https://github.com/starwards/starwards/issues/1925) |
| ~~C1.4~~     | ~~Ammo selection UI audit~~ — **done** (resolved by screenshot review on 2026-05-03)                     | —                                                           |

### Group C2 — needs Daniel (Track A)

| ID           | Task                                                                                                            | Blocked on   |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ------------ |
| ~~C2.1~~     | ~~`ArmorType` enum + per-plate type assignment in schema~~ — **done** (PR #1932 lineage; landed as layered `ArmorPlate`/`ArmorLayer` + `armor-models.ts`) | —            |
| ~~C2.2~~     | ~~Add new ammo types to `ammoDesigns`, `Magazine` (`max_*`/`count_*`), `chain-gun` (`use_*`)~~ — **done** (PR #1932 lineage; 9 ammo types)       | —            |
| ~~C2.3~~     | ~~Armor-type-aware damage matrix in `damage-manager.ts`~~ — **done** (PR #1932 lineage; per-layer resolution walk)                               | —            |
| ~~C2.4~~     | ~~Per-ammo heat values from A4 wired into C1.1~~ — **done** (PR #1932 lineage; `heatPerShot` consumed in `chain-gun-manager.ts`)                 | —            |
| ~~C2.5~~     | ~~Magazine capacity per A5~~ — **done** (PR #1932 lineage; per-ammo `max_*` in `magazine.ts`)                                                    | —            |
| C2.6 **[C]** | Cycle UI improvements (persistent strip, magazine counts, next-preview, optional `Shift+B` / `Shift+V` reverse) | — (A2 done)  |

### Group C3 — needs User (Track B)

| ID           | Task                                                                                                                 | Blocked on |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| C3.1 **[C]** | Beam-geometry primitive + in-beam check                                                                              | B1         |
| C3.2 **[C]** | Refactor `signals-job-manager.ts` scan branch: probabilistic → geometric lock-and-hold; freeze hack branch unchanged | B1 + C3.1  |
| C3.3 **[C]** | Snapshot data structure (full target design + state)                                                                 | B2         |
| C3.4 **[C]** | Snapshot consumer wiring (Signals widget + tactical/weapons radar tints)                                             | B2 + C3.3  |
| C3.5 **[C]** | Repair execution engine (queue runtime + resource consumption + malfunction-clear)                                   | B3         |
| C3.6 **[C]** | Repair protocol catalog data + lookup                                                                                | B4 + C3.5  |
| C3.7 **[C]** | Engineering operations queue UI                                                                                      | B3 + C3.5  |
| C3.8 **[C]** | Closed-transponder cost wiring                                                                                       | B5 + C1.2  |

---

## Recommended kickoff (parallel-friendly)

*Updated 2026-07-20: the first and second waves are largely delivered — Track A (A1–A5) and C2.1–C2.5 shipped via PR #1932; C1.1 and C1.3 landed via #1930 / #1933.*

**Remaining work:**
- **You** draft the B-track designs: B1, B3 (most blocking). Cheap small ones any time: B5, B7, B8. Then B2, B4.
- **Claude** executes C2.6 (cycle UI, [#1969](https://github.com/starwards/starwards/issues/1969)) — unblocked now.
- **Claude** executes C3.x as the B designs land: C3.1+C3.2 (scan geometry), C3.5 (repair engine), then C3.3, C3.4, C3.6, C3.7, C3.8.
- Tuning + playtest.

---

## Cross-cutting notes

- **Per-ship-design ammo loadout** — confirmed 2026-05-03. Cycling stays in the weapons UI (direct-bind dropped).
- **Heat infra is live.** C1.1 is done — `chain-gun-manager.ts` calls `addHeat(heatPerShot * effectiveness, chainGun)` on fire (#1930); the rest of the chain works today.
- **Repair logic is greenfield.** No repair code exists for system damage. C3.5 is the largest single-feature cost in the milestone.
- **Tier-2 scan is a partial rewrite.** Existing `signals-job-manager.ts` is probabilistic + range-based; new spec is deterministic + geometric. Hack branch is co-located but out of milestone scope — leave behaviour intact.
- **`ammoDesigns` is hard-coded.** The 9-type integration has landed (PR #1932) across chain-gun, magazine, projectile, damage-manager, and ship configs; the const itself remains hard-coded in `projectile.ts`.
