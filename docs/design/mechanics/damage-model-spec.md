# Damage Model Specification — Armor × Ammo (PR #1932)

> Feature specification distilled from [#1929](https://github.com/starwards/starwards/issues/1929) /
> [PR #1932](https://github.com/starwards/starwards/pull/1932). Companion to
> [Armor & Damage](armor-and-damage.md) (station-level view) and
> [`docs/SUBSYSTEMS.md`](../../SUBSYSTEMS.md) (implementation detail).
> Rationale for every non-obvious call: decision records [006](../decisions/006-damage-profile-unification.md)–[011](../decisions/011-armor-table-rebalance.md).

## 1. Concept

Weapon effect is decomposed into two independent halves, so armor and ammo can be tuned without
touching code:

- **Damage profile** (per damage *type*, `modules/core/src/space/damage-profile.ts`) — what the
  hit does to a ship once armor is resolved: which layer it reaches, how wide, how hard.
- **Armor stats** (per armor *model*, `modules/core/src/configurations/armor-models.ts`) — raw
  numbers describing how this armor engages each damage type.

There is no lookup matrix and no `instanceof` checks: projectiles/explosions carry a polymorphic
`damageType`, collisions copy it into the `Damage` struct, and `DamageManager` resolves
profile × armor numerically.

## 2. Damage types and profiles

Five damage types. A profile has: `systemScope` (`single` = one random system, `multi` = every
matching system in the hit area, `electronics` = all electronics **ship-wide**, ignoring arc),
`hitsInternal` (which layer the penetrating damage reaches — strict either/or),
`systemDamageFactor` (multiplier on penetrating damage), and the surface-scrape channel
(`surfaceEffect`, `surfaceDamageFactor`, `deflectable`).

| Type | Scope | Reaches | Factor | Scrape (×) | Deflectable | Fiction |
|---|---|---|---|---|---|---|
| HiExp | multi | internal | 1 | yes (0.25) | yes | blast wave: breaches inward, washes the deck |
| ArmPen | single | internal | 1.5 | no | yes | kinetic dart: one deep channel, nothing outside |
| Frag | multi | external | 0.5 | yes (**2**) | **no** — no round to deflect | shrapnel cloud: shreds equipment, can't get inside |
| Tandem | single | internal | 1 | no | **no** — precursor defeats the deflection | shaped charge (HEAT): slightly weaker ArmPen, defeats ERA |
| Elec | electronics | (electronics, ship-wide) | 2 | no | yes | EMP: hits electronics wherever mounted |

Everything is deflectable except Tandem and Frag. The flag currently gates the surface scrape;
the round-defeating side of deflection (Reactive popping a cell to stop the hit, Tandem's
precursor beating it) is encoded in the armor table below.

**Invariant:** weapons whose penetrating damage reaches internal systems can never full-force
damage externals — externals are touched *only* by the scrape channel (and by Elec via the
electronics scope).

## 3. The two damage channels

**Penetrating/exposure channel.** Once per hit area:
`exposure = max(penetration, brokenPlateRatio)`; if `exposure > 0`, matching systems roll
`damage × systemDamageFactor` scaled by exposure. `plateDamage` never scales this channel
(007 — armor decides *time to breach*, not post-breach pain).

**Surface-scrape channel.** Unconditional on every hit path for `surfaceEffect` types:
externals in the arc roll `damage × 0.05 × surfaceDamageFactor`. The only negation is
`deflectsSurfaceEffect` armor (Reactive) against `deflectable` types (HiExp) — shrapnel cannot
be deflected. Calibration (010): explosion damage arrives per tick with growing overlap, so the
constant is tuned for *sanding* — a full frag-cloud engulfment causes ~4–6 small defects per
external system; a HiExp wash well under 1.

## 4. Armor engagement — `plateDamage / penetration` per type

`plateDamage` multiplies **plate erosion only** (0 = the armor does not engage the hit at all);
`penetration` is the fraction of system damage that bypasses intact plates (0..1; ≥1 on a
non-engaging hit = the armor is transparent).

| vs | Composite | Whipple | Hardened | Reactive ⁽¹⁾ | Faraday |
|---|---|---|---|---|---|
| HiExp | 1/0 | 0.25/0 | 0.5/0 | 1/0 pop | 0/1 |
| ArmPen | **2/0** | **0/1** | 1/0 | 1/0 pop | 0/1 |
| Frag | 0/0 | 0/0 | 0/0 | 0/0 ⁽²⁾ | 0/0 |
| Tandem | 1/0 | **0/0** | **2/0** | **1/1** pop | 0/1 |
| Elec | 0/1 | 0/1 | 0/1 | 1/0 pop | **0/0** |

⁽¹⁾ Reactive: `singleUsePlates` — an engaging hit pops the cells in the arc (they never heal)
and is *defeated* (exposure is measured **before** the pop); follow-up hits on the bared section
get through. `deflectsSurfaceEffect` negates the HiExp scrape.
⁽²⁾ Frag does not activate ERA (no cell consumed) but its scrape lands — shrapnel has no round
to deflect.

**Armor identities:** Composite = baseline, penetrators are its weakness. Whipple = standoff
screen: blunts blast, defeats shaped charges, transparent to kinetic darts. Hardened = slab:
stops kinetic rounds, ground down slowly by blast, burned by HEAT jets. Reactive = defeats every
warhead once per cell; depleted by sustained fire; Tandem skips the attrition; the only armor
that blocks Elec (at cell cost) and the only anti-blast-scrape answer. Faraday = kills Elec,
transparent to everything physical (except Frag, which never penetrates anything).

Values between the anchors (0 immune · 0.25/0.5 resistant · 1 normal · 2 vulnerable) are legal
and tunable per model with no code changes.

## 5. Ammo catalog (9 types)

| Ammo | Type | Explosion dmg | Blast size ⁽³⁾ | Heat | Dragonfly magazine |
|---|---|---|---|---|---|
| HiExpShell (30mm) | HiExp | 20 | 200m × 1s | 5 | 2400 |
| ArmPenShell (30mm) | ArmPen | 30 | 40m × 0.5s | 5 | 1200 |
| FragShell (30mm) | Frag | 10 | 250m × 1s | 5 | 2000 |
| HiExpMissile | HiExp | 50 | 350m × 0.35s | 25 | 12 |
| ArmPenMissile | ArmPen | 80 | 200m × 0.25s | 25 | 6 |
| FragMissile | Frag | 10 | **800m × 1.6s** | 25 | 8 |
| ClusterMissile — Frag mode | Frag | 10 | 750m × 1s | 25 | 6 |
| ClusterMissile — ArmPen mode | ArmPen | 40 | 400m × 0.4s | 25 | ↑ shared |
| TandemMissile | Tandem | 60 | 300m × 0.3s | 25 | 4 |
| ElecMissile | Elec | 5 | 300m × 0.3s | 25 | 4 |

⁽³⁾ Blast size = `expansionSpeed × secondsToLive` (max explosion radius). `blastFactor` is
**knockback**, not area. All frag warheads share one intensity (10) and differ only by cloud
size/linger; the dedicated FragMissile beats the cluster's frag mode on both.

**Cluster warhead modes:** `ChainGun.clusterWarhead` (`'Frag' | 'ArmPen'`, tweakable + synced)
is stamped on the projectile at launch; the projectile's own `warhead` stays switchable until
detonation (`Projectile.makeExplosion()` builds the explosion from the mode in effect). No new
command infrastructure — rides `@tweakable`/JSON-pointer/Tweakpane like every other field.

## 6. System classification

External (scrapeable): thrusters, chain gun, tubes, radar, docking, signals. Internal: reactor,
warp, magazine, maneuvering, smart pilot. Electronics (Elec targets, either layer): everything
except thrusters and maneuvering. Classification is per system *class* (`isInternal` /
`isElectronics` on `SystemState`); making it per-ship-design is
[#1954](https://github.com/starwards/starwards/issues/1954).

## 7. Tuning knobs (all data, no code)

- `configurations/armor-models.ts` — every armor number, `singleUsePlates`, `deflectsSurfaceEffect`
- `space/damage-profile.ts` — profile scopes/factors, scrape strengths, deflectability
- `space/projectile.ts` — explosion damage/size/linger, homing, heat, cluster modes
- `ship/damage-manager.ts` — `SURFACE_EFFECT_FACTOR` (global scrape calibration)
- Regression pins live in `test/damage-profile.spec.ts`, `test/armor-models.spec.ts`,
  `test/damage-manager-matrix.spec.ts` — any tuning change is a deliberate pin update.

## 8. Open questions / follow-up candidates (out of PR scope)

1. **Play-test the calibration** — 010/011 numbers were derived analytically (per-tick explosion
   damage × overlap), not in play. Watch: frag defect rate on externals, Hardened time-to-kill
   via HiExp grind, Reactive cell-attrition pace vs cheap ArmPen shells.
2. **Weapons-station UI for cluster mode** — state/commands exist; a labeled Frag/ArmPen toggle
   on the tube widget is presentation work.
3. **Counter-play vs Frag** — no armor answers shrapnel by design; the counters are range,
   repair, and (future) point defense. Confirm that's the intended doctrine.
4. **HEAT surface realism** — real shaped charges detonate on the hull (MP-HEAT exists); Tandem
   currently has zero surface effect for role clarity. A token scrape (~0.1–0.25, deflectable)
   is a two-number change if wanted.
5. **Per-ship system mounting** — [#1954](https://github.com/starwards/starwards/issues/1954)
   (blocked on this PR).
6. **Ammo widget grouping** — 9 flat rows; shells/missiles grouping or per-tube filtering may
   read better at the weapons station.
