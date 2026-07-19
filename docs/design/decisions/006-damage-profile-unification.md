# Decision: Damage-profile unification for the armor/ammo rework (PR #1932)

**Date:** 2026-07
**Status:** Accepted (operative — pending review by original author @KokoiG).
Partially superseded by [007](007-plate-damage-erosion-only.md): plateDamage no longer scales
system damage (item 8's ×4), and Hardened is now resistant (0.5) rather than immune to HiExp.
Also superseded by [009](009-frag-mechanics-and-cluster-modes.md) — item 6's "Frag armor numbers
identical to HiExp" no longer holds (Frag is `0/0` on every model) — and by
[011](011-armor-table-rebalance.md): item 1 (Whipple vs HiExp is now `0.25/0`, not blocked),
item 2 (Reactive vs ArmPen now engages `1/0` — the cell pops), and item 5 (Composite vs ArmPen
is now `2/0`, penetrators are its weakness).

## Context

The PR #1932 review (amir-arad) required dissolving the central ammo×armor outcome matrix
into per-ammo _damage profiles_ and per-armor-model raw numbers in `ArmorDesignState`
(`plateDamage_<T>` / `penetration_<T>`), with HiExp behaving the same for missile and shell.
Unifying shell and missile rows of the original #1929 matrix into a single profile forced
several balance calls that the matrix previously kept separate. These were made operatively
during the rework and are recorded here for review by the original author.

## Decision

1. **Whipple vs HiExp = blocked (old "resist", shell row wins).** The old matrix had
   CannonHe→resist but MissileHe→normal. Missiles still hit harder via larger explosion
   `damageFactor` (50 vs 20).
2. **Reactive vs ArmPen = blocked (old "resist", Sabot row wins).** Old CannonAp→normal,
   Sabot→resist. Rationale: ERA defeats single-stage penetrators; TandemMissile exists
   specifically to beat Reactive.
3. **Unified ArmPen system profile: scope `single`, `systemDamageFactor` 1.5** (old AP shell
   medium=1, Sabot high=2).
4. **Unified HiExp system profile: scope `multi`, internal, factor 1** (old shell was
   single-external low=0.5; missile row wins).
5. **Composite vs ArmPen = normal (plateDamage 1, old AP-shell row).** Old Sabot row said
   vulnerable. Composite stays the balanced generalist; ArmPen shines vs Whipple/Hardened.
6. **Frag keeps its own damage profile** (reviewer question "CannonFrag same as CannonHe?"):
   armor numbers are identical to HiExp _today_, but the profile differs (external-only,
   factor 0.5) and per-armor-model numbers can diverge freely later.
7. **`hasFaradayLayer` deleted.** Faraday is just the Elec column: base models ship with
   `penetration_Elec=1`; `withFaradayLayer(stats)` overrides to blocked; pure `faradayArmor`
   blocks Elec and lets all physical types bypass.
8. **Old "critical" (Tandem vs Reactive) encoded as `plateDamage_Tandem=4, penetration_Tandem=1`
   plus `singleUsePlates`** — preserves the old ×4 system damage and full exposure; cells pop
   permanently.
9. **Heat-per-shot moved to `ProjectileDesign.heatPerShot`** (5 shells / 25 missiles),
   replacing the 8 `heat_*` fields per weapon design added in #1930. Heat is a property of
   the round, not the launcher; a per-weapon override can be reintroduced if needed.
10. **Missile performance literals** replace the 1–5 `STAT_SCALE`: values are the old
    computed outputs (e.g. ArmPenMissile maxSpeed 960 = 600×1.6), so behavior is unchanged
    but numbers are now tracked directly in `ammoDesigns`.

## Consequences

- One profile per ammo family: shells and missiles of the same family are distinguished by
  explosion damage/blast and delivery (homing), not by matrix rows.
- HiExpShell system damage doubled vs old (factor 0.5→1, single→multi external+internal via
  exposure); FragShell unchanged in armor engagement but keeps low factor.
- Armor identity now lives entirely in `configurations/armor-models.ts` literal numbers —
  new armor models need no code changes in ship logic.
- Items 1–5 shift balance from the original #1929 matrix; play-testing may revisit the
  numbers, which are now trivial to tune per armor model.
