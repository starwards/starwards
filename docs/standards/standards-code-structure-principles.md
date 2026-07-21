---
audience: agent
depth: deep
source_of_truth:
  - standards-code-structure.md
related:
  - standards-code-style.md
  - ../PATTERNS.md
last_verified: 2026-07-15
---

# Principles Behind the Code Structure Standards

The motivations underlying the rules in [standards-code-structure.md](standards-code-structure.md).
Each principle answers a concrete failure mode observed in the armor/ammo rework (PR #1932).

## The union's const array is the single edit point for "add a member"

Before: adding a ninth ammo type (FragMissile) required finding every hand-listed `max_*`/`use_*`
field, every loop, every reset — and things were missed (`resetShipState` restored only
`count_HiExpShell`; a node-red example still pointed at a stale `count_Missile`). After: per-member
fields are mapped from the array-derived union, so the compiler produces the to-do list.

## Derive in the right direction

`ammoTypes` was `Object.keys(ammoDesigns) as AmmoType[]` — a cast, and the data table defined the
set. Now declared arrays (`shellAmmoTypes` + `missileAmmoTypes`) define the set; the table merely
`satisfies` it.

## Object configuration is simple and self-contained; complex domains are separated out

A ship config states only ship-level intent (`type: 'composite'`, `withFaradayLayer: false`); the
armor-model domain — stats, layering logic — lives behind the `armorModels` registry, resolved at
instantiation. No `...compositeArmor` spreads importing another domain's internals into the config.

## A convention that only comments know gets promoted to a named decoder

"plateFactor 0 means the armor doesn't engage; then penetration is only meaningfully 0 or 1" was
encoded as raw numbers interpreted inline by the damage manager. `ArmorDesignState.response()`
returning `bypass | block | engage` moves that interpretation into armor itself — one decoder, and
the caller switches on names instead of re-deriving the rule.

## Absence with semantics gets a name

`damageType: null` didn't mean "unknown" — it meant specific behavior (the flat kinetic damage
path). `'Collision'` names that case; the `isWeaponDamageType` guard makes the split checkable.
Follow-through: once the union no longer covered all damage, `DamageType` was renamed
`WeaponDamageType`, because the old name had become a lie.

## Each gameplay rule gets exactly one enforcement site

"Elec applies once per hit" and "one reactive cell pops per hit" were previously emergent from loop
structure (and wrong — per-area). Now: electronics damage is folded outside the area loop; the cell
pop is threaded as an explicit `mayPopCell` parameter with a `{brokenPlates, cellPopped}` result —
the rule is visible in a signature, not implied by iteration order.

## Collapse parallel code paths by normalizing their input, not by abstracting their logic

The four system-damage paths (bypass / engage / electronics / per-area) all reduce to
`(system, exposure)` pairs; bypass is "exposure 1 per area." The unification came from finding the
common data shape — which is also where the per-area electronics bug had been hiding.

## The spec describes the user experience, not the technical implementation

The spec claimed 60 ticks/s (the loop runs at 20) — a player can't observe tick counts, only damage
over time. Rewritten in player-observable terms: per-second damage, "deterministic victim" without
naming the hash, probability-curve shape as a tuning choice. Where code deviates from spec, the
deviation is written down (Reactive per-tick pop → spec §11 replan list), not papered over.

## Acronyms collide; abbreviations keep morphology

"HE"/"AP" read as other things and get mis-expanded; `HiExp`/`ArmPen` remain unambiguous fragments
of the full words.
