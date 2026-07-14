# Decision: Frag never deflects/penetrates; Cluster becomes a dual-mode warhead

**Date:** 2026-07
**Status:** Accepted. Item 4's warhead numbers superseded by
[010](010-blast-size-and-surface-factors.md): all frag warheads share `damageFactor 10`, blast
size is encoded in `expansionSpeed × secondsToLive` (not `blastFactor`, which is knockback only).

## Context

Three follow-ups to the unconditional surface effect ([008](008-unconditional-surface-effect.md)):
Reactive armor deflecting Frag made no physical sense (ERA reacts to an incoming round — a
shrapnel cloud has nothing to deflect and arrives anyway), Frag fully penetrating pure Faraday
armor contradicted "shrapnel cannot pierce a hull", and the Cluster damage type was redundant —
a cluster munition is a delivery vehicle whose submunitions are either fragmentation or
armor-piercing.

## Decision

1. **Frag is not deflectable.** New `deflectable` flag on damage profiles; `deflectsSurfaceEffect`
   armor (Reactive) only negates the scrape of deflectable types (HiExp). Frag scrapes external
   systems on every armor model, no exceptions. ERA cells still do not react to Frag
   (`plateDamage_Frag: 0` — no engagement, no cell consumed).
2. **Frag never penetrates plates.** `penetration_Frag` is 0 on every model including pure
   Faraday (was 1). Frag's damage is externals-only: the unconditional scrape plus exposure
   through already-broken plate sections.
3. **The `Cluster` damage type is dissolved.** `damageTypes` is now HiExp/ArmPen/Frag/Tandem/Elec;
   the `plateDamage_Cluster`/`penetration_Cluster` armor columns are removed.
4. **ClusterMissile gets selectable warhead modes** (`warheads` on the projectile design):
    - **Frag mode (default):** wide shrapnel shower — damageFactor 20, blastFactor 6 (the widest
      blast in the game; FragShell is 4 — big, not comical).
    - **ArmPen mode:** focused submunitions — damageFactor 40, blastFactor 2 (small blast, still
      wider than a HiExp missile's 1; well below the dedicated ArmPen missile's 80 damage).
      The mode is set per tube (`ChainGun.clusterWarhead`, tweakable/synced) and stamped on the
      projectile at launch; the projectile's `warhead` field stays switchable until detonation,
      when the explosion is built from the mode in effect (`Projectile.makeExplosion()`).

## Consequences

- Frag's role is now pure and universal: external-system suppression vs every armor, with no
  hard counter (Reactive included); it can never touch internals or erode plates it doesn't
  already engage.
- Reactive's blast deflection now covers HiExp only — its anti-blast supremacy from 008 is
  narrowed; the answer to Frag harassment is repairing/hardening externals, not armor choice.
- ClusterMissile is the flexible magazine slot: one stock, two roles, chosen at the tube in
  flight-time. It pays for flexibility with lower per-mode numbers than the dedicated
  FragShell-pattern or ArmPen missiles.
- The armor table shrinks to 5 damage-type columns; existing 006/007/008 records reference the
  old Cluster type historically.
