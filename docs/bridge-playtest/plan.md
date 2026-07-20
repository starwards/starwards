# Bridge MVP — Task Plan

Concrete task breakdown for the next milestone, derived from [`decisions.md`](decisions.md). Three parallel tracks:

- **[D]** = Daniel designs (armor / ammo)
- **[U]** = User designs (damage control / scan beam control / closed-transponder cost)
- **[C]** = Claude executes (straightforward, agent-ready once spec'd)

For deferred ideas, see [`proposals.md`](proposals.md). For work already shipped, see [Delivered](#delivered) at the foot of this doc.

---

## Track A — Daniel-designed (armor + ammo)

Fully delivered — see [Delivered](#delivered).

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

Group C1 (independent) and C2.1–C2.5 (armor + ammo integration) are fully delivered — see [Delivered](#delivered). Remaining Claude work:

### Group C2 — weapons UI

| ID           | Task                                                                                                            | Blocked on   |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ------------ |
| C2.6 **[C]** | Cycle UI improvements (persistent strip, magazine counts, next-preview, optional `Shift+B` / `Shift+V` reverse) | — (ready)    |

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

## Recommended sequence

- **You** draft the B-track designs: B1, B3 (most blocking). Cheap small ones any time: B5, B7, B8. Then B2, B4.
- **Claude** executes C2.6 (cycle UI, [#1969](https://github.com/starwards/starwards/issues/1969)) — ready now.
- **Claude** executes C3.x as the B designs land: C3.1+C3.2 (scan geometry), C3.5 (repair engine), then C3.3, C3.4, C3.6, C3.7, C3.8.
- Tuning + playtest.

---

## Cross-cutting notes

- **Per-ship-design ammo loadout** — confirmed 2026-05-03. Cycling stays in the weapons UI (direct-bind dropped).
- **Heat infra is live.** C1.1 is done — `chain-gun-manager.ts` calls `addHeat(heatPerShot * effectiveness, chainGun)` on fire (#1930); the rest of the chain works today.
- **Repair logic is greenfield.** No repair code exists for system damage. C3.5 is the largest single-feature cost in the milestone.
- **Tier-2 scan is a partial rewrite.** Existing `signals-job-manager.ts` is probabilistic + range-based; new spec is deterministic + geometric. Hack branch is co-located but out of milestone scope — leave behaviour intact.
- **`ammoDesigns` is hard-coded.** The 9-type integration has landed (PR #1932) across chain-gun, magazine, projectile, damage-manager, and ship configs; the const itself remains hard-coded in `projectile.ts`.

---

## Delivered

Completed tasks, collapsed to unblock the tables above. Detail lives in git history and the linked PRs.

- **Track A (A1–A5)** — armor plate types, ammo types, full armor × ammo damage matrix, per-ammo heat-per-shot, per-ammo magazine capacity. Shipped via **PR #1932** (2026-07): 5 armor models (`armor-models.ts`), 3 shells + 6 missiles (`projectile.ts`), per-layer resolution (`damage-manager.ts`), `heatPerShot` per design, `max_*` capacity (`magazine.ts`).
- **C1.1** — weapons-fire heat wiring. **#1930** (closes #1923); `chain-gun-manager.ts` calls `addHeat`.
- **C1.2** — `callsign` + `transponderOpen` on `Spaceship`. **#1927** (closes #1924).
- **C1.3** — 5s in-range UFO→BASIC scan promotion, transponder-gated. **#1933** (closes #1925); `TIER1_DWELL_SECONDS` in `signals-job-manager.ts`.
- **C1.4** — ammo selection UI audit. Resolved by screenshot review 2026-05-03.
- **C2.1–C2.5** — armor/ammo integration (PR #1932 lineage): layered `ArmorPlate`/`ArmorLayer` schema, 9 ammo types across `ammoDesigns`/`Magazine`, armor-type-aware matrix, per-ammo heat, magazine capacity.
