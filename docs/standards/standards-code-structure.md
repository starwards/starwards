---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/ship/armor.ts
  - modules/core/src/configurations/armor-models.ts
  - modules/core/src/ship/chain-gun.ts
  - modules/core/src/ship/magazine.ts
  - modules/core/src/space/projectile.ts
  - modules/core/src/space/damage-profile.ts
  - modules/core/src/ship/attack-resolution-manager.ts
  - modules/core/src/ship/damage-manager.ts
related:
  - standards-code-style.md
  - standards-naming.md
  - ../PATTERNS.md
last_verified: 2026-08-01
---

# Code Structure Standards

Structural conventions for the codebase. Established during the armor/ammo rework (PR #1932); the
`source_of_truth` files above are the reference implementations.

## Exhaustiveness by construction — the build breaks when a union grows

- **Per-value fields are mapped types over the union, never hand-listed.** When a type has one
  field per member of a union, derive it:
  ``{ [T in WeaponDamageType as `plateDamage_${T}`]: number }`` (`ArmorModelStats`),
  ``{ [T in AmmoType as `use_${T}`]: boolean }`` (`ChaingunDesign`),
  ``{ [T in AmmoType as `max_${T}`]: number }`` (`MagazineDesign`). Adding a value to the union
  then fails compilation everywhere until every consumer takes a stance on it.
- **Such mapped fields are mandatory, not optional.** Configs spell out every entry explicitly
  (`use_HiExpMissile: false`, ...) rather than relying on defaults — a config is a complete
  statement of intent.
- **Const lookup tables use `as const satisfies Record<Key, Value>`** so completeness is checked
  while literal inference is preserved: `ammoDesigns`, `armorModels`.
- **Back the types with runtime completeness specs** where the data is game-critical:
  `armor-models.spec.ts` iterates every damage type × every armor model and validates value
  bounds (e.g. penetration is binary when the armor does not engage).

## Model the domain in the type system — no sentinels, no parallel conventions

- **No `null`/magic sentinel values in unions.** Use an explicit variant:
  `SpaceDamageType = WeaponDamageType | 'Collision'` with the `isWeaponDamageType` type guard,
  not `DamageType | null` with `=== null` branches.
- **Name unions for what they mean**, not for where they started: `WeaponDamageType` vs
  `SpaceDamageType`, `AmmoType` (with `ShellAmmoType`/`MissileAmmoType` subsets).
- **Encode behavioral invariants as discriminated unions** owned by the domain object, not as
  numeric conventions decoded by callers: `ArmorDesignState.response()` returns
  `{kind: 'bypass'} | {kind: 'block'} | {kind: 'engage'; plateFactor; penetration}` — the
  "penetration is binary when plates don't engage" rule lives with the armor design.
- **Resolve derived data once and carry it in the type**: `AttackDamage = Damage &
  {damageType: WeaponDamageType; profile: DamageProfile}` — consumers never re-look-up a
  profile from a maybe-absent field.

## Configuration is declarative data, not imported logic

- **Ship configs do not import stats from other modules.** A config names what it wants via a
  union of literals and lets instantiation resolve it: `dragonflyArmor` declares
  `type: 'composite', withFaradayLayer: false`; `makeArmor` resolves the name through the
  `armorModels` registry (`ArmorModelName` keeps the name checked). No `...compositeArmor`
  spreads in configs.
- **Type configs with `satisfies`, not annotations**: `dragonflySF22 = {...} satisfies
  ShipDesign` keeps the config a checked plain literal without widening.
- **Use concrete literal numbers in design data** — no abstract 1–5 scales, no formulas where a
  literal is enough. Numbers must be simple to track and change.

## One canonical name, one abstraction

- **One domain vocabulary end-to-end.** Ammo is `ammoTypes`/`ammoDesigns`/`AmmoType` in core,
  browser, and tests alike. No redundant aliases (`type ProjectileModel = AmmoType` is the
  anti-pattern).
- **Derive lists by composing declared const arrays** (`ammoTypes = [...shellAmmoTypes,
  ...missileAmmoTypes]`), not by `Object.keys()` of a data table.
- **Loops iterate the canonical list**, never name one member as a stand-in for all
  (`for (const at of ammoTypes)` in `resetShipState`, `updateAmmo`, deplete-ammo tests).
- **Fold parallel type definitions into one.** `ArmorModelStats` is defined once;
  `ArmorDesign` composes it and `ArmorDesignState implements` it — no restated field lists.

## Pipeline structure over branching monoliths

`attack-resolution-manager.ts` and `damage-manager.ts` are the reference:

- **Split methods along union variants** instead of branching inside one method:
  `takeWeaponDamage` / `takeCollisionDamage`, dispatched by the type guard.
- **Unify parallel code paths onto one function over uniform data.** All system-damage paths
  (penetrating, per-area, electronics, bypass) are one `resolvePenetrationChannel` over
  `(system, exposure)` candidates; bypass is just "full exposure per area".
- **Extract stateful loop bodies into functions with explicit result objects**
  (`engagePlatesInArea` → `{brokenPlates, cellPopped}`) instead of mutating flags inside the
  loop.

## Naming and comment hygiene

- **No acronyms in names or comments** (HE, AP, ERA, HEAT, EMP). Abbreviations are fine
  (`HiExp`, `ArmPen`); acronyms are a semantic footgun. Comments spell things out: "reactive
  cells", "shaped charge", "vulnerable to Elec (electronic warfare) damage".
- **No dead code, no tombstones.** Delete commented-out code and stale prose outright; never
  leave "was previously X" markers.
- **Use JSDoc (`/** */`) for declaration-level documentation** (type fields, exported
  constants); reserve `//` for in-body remarks. Comments explain *why*, never *what*.
- **Top-level imports only** — no inline `import('...')` type references.
- **Import order is enforced** by `importSort` (package.json); let the tooling sort.

## Design docs are contracts, not implementation transcripts

- Specs state **player-observable outcomes**; algorithms, curve shapes, tick rates, and roll
  schemes are implementation choices the spec must not fix (e.g. explosion damage is defined
  per second, not per tick).
- Docs must match code: known deviations are documented explicitly in decision records and the
  spec's replan list; wrong claims are deleted; status lines stay honest (`Done` only when
  done); decision records cross-link their supersessions.
