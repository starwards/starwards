# Decision: armor table rebalance — AP hierarchy, reactive pops on any warhead

**Date:** 2026-07
**Status:** Accepted (author-directed, @KokoiG)

## Context

Review of the post-007/008/009/010 table produced a clearer set of armor identities around the
penetrator family and reactive armor.

## Decision

1. **ArmPen hierarchy:** Composite `2/0` (penetrators are its weakness), Whipple `0/1` (the round
   punches straight through the thin standoff shield — full bypass, plates never engage),
   Hardened `1/0` (the one armor that genuinely stops penetrators).
   **Whipple vs HiExp softened to `0.25/0`:** the screen defeats most of the blast, but massed
   HE remains a very slow plan-C instead of a hard wall.
2. **Tandem is the shaped-charge (HEAT) family, a slightly weaker ArmPen with opposite walls:**
   profile changed to `single` scope with factor 1 (vs ArmPen's 1.5). Composite `1/0`. The two
   penetrators diverge where their physics do: Whipple's standoff screen pre-detonates the
   shaped charge (Tandem `0/0`, vs ArmPen's `0/1` punch-through), while the jet burns through
   the thick Hardened slab double-speed (Tandem `2/0`, vs ArmPen's `1/0` stop) — Hardened's
   dedicated counter. Tandem remains the only round that both pops and fully penetrates
   Reactive (`1/1`). A dedicated single-stage HEAT ammo was considered and rejected: five
   damage types stay readable for a bridge crew, and the niche is covered by this
   reinterpretation (a future HEAT round can slot in as a third cluster-missile warhead mode).
3. **Reactive cells react to any warhead — HiExp, ArmPen, and Elec are `1/0`:** the cell pops
   and defeats the hit (nothing penetrates), but the cell is spent. Mechanical
   fix: exposure is measured **before** the pop, so the popping hit cannot leak damage through
   its own freshly-bared section; follow-up hits on that section get through normally.
   Reactive now blocks Elec (was bypass) at the cost of cells.
   The intended rate is **one cell per hit**. For defeated warheads that holds (the pop consumes
   the explosion), but a Tandem explosion survives the pop and its damage arrives per tick, so
   today it pops one cell _per tick_ over its blast life — a single Tandem strike burns several
   cells in the arc. Known deviation, to be fixed toward per-hit.
4. **Frag never interacts with armor at all — `0/0` on every model** (Composite included): no
   plate erosion, no penetration, no ERA activation. Its entire damage output is the
   unconditional surface scrape (009/010), which no armor except nothing can stop — shrapnel is
   not deflectable.

## Consequences

- Rock-paper-scissors sharpened: AP shreds Composite, ignores Whipple, is stopped by Hardened;
  blast is the anti-Whipple tool; Hardened is ground down slowly by HiExp; Reactive defeats
  everything once per cell and is depleted by sustained fire of any warhead — Tandem skips the
  attrition, Frag sands its externals for free.
- Reactive is no longer free immunity: every defeated warhead costs a cell (12 on the
  demo ship), making cheap AP shells a viable "strip the ERA" tactic before a killing blow.
- Whipple's ArmPen/Tandem weakness changed in kind: plates stay intact but systems take full
  bypass damage immediately — the shield is simply irrelevant against penetrators.
