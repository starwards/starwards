# Decision: differentiated blast sizes; Frag is the strongest surface scraper

**Date:** 2026-07
**Status:** Accepted (numbers pending review)

## Context

Two findings after [009](009-frag-mechanics-and-cluster-modes.md):

1. `blastFactor` is knockback strength, not blast area — the actual blast size is
   `expansionSpeed × secondsToLive` (the explosion's maximum radius), and every missile shared
   an identical 500m blast. 009's cluster-mode "wide vs focused" intent was mis-encoded in
   `blastFactor`.
2. Frag was the *weakest* surface scraper: the scrape used `systemDamageFactor` (Frag 0.5 vs
   HiExp 1) on top of a lower explosion `damageFactor`, so the dedicated anti-external weapon
   was out-scraped 4× by HiExp — inverted from its role.

## Decision

1. **New `surfaceDamageFactor` on damage profiles**, used by the surface scrape instead of
   `systemDamageFactor`: **Frag 2** (shrapnel is purpose-built to shred equipment),
   **HiExp 0.25** (a blast wave only washes over it), 0 for non-surface types. Frag out-scrapes
   HiExp in every class.
2. **Scrape calibrated for sanding, not instant kills.** Explosion damage arrives per tick
   (`damageFactor × dt × overlap`) and overlap grows with the expanding cloud, so the original
   factors made every tick a near-guaranteed defect roll (~18 defects per system per missile).
   `SURFACE_EFFECT_FACTOR` lowered 0.25 → 0.05: a full frag-cloud engulfment now yields roughly
   4–6 small defects per external system; a HiExp blast wash well under 1.
3. **All frag warheads share one intensity (`damageFactor 10`)** — shell, cluster mode, and the
   dedicated missile differ only in cloud size and linger time: FragShell 250m×1s,
   Cluster-Frag 750m×1s, FragMissile 800m×**1.6s** (its "a bit stronger" is the bigger,
   longer-lingering cloud, not a hotter one).
4. **Missile blast sizes are differentiated** via explosion `expansionSpeed`/`secondsToLive`
   (shells unchanged; `blastFactor` toned to knockback-sane values ≤1 except shells):

   | Warhead | Size | Character |
   |---|---|---|
   | ArmPen missile | 200m (800×0.25) | tight instant punch |
   | Tandem / Elec missile | 300m (1000×0.3) | focused — delivery is the point |
   | HiExp missile | 350m (1000×0.35) | big sharp blast |
   | Cluster ArmPen mode | 400m (1000×0.4) | small, still bigger than HiExp |
   | Cluster Frag mode | 750m (750×1.0) | big *lingering* shrapnel cloud |
   | Frag missile (new, 9th ammo) | 800m (500×1.6) | dedicated shrapnel warhead — bigger cloud, longest linger |

   The Frag cloud reaches its size slowly and persists a full second — ships can fly into it
   and damage accumulates over more ticks; the AP/HE blasts are near-instant flashes.

## Consequences

- Frag/Cluster-Frag is now unambiguously the best anti-external weapon, on every armor
  (Reactive included, per 009), and the largest area weapon.
- `secondsToLive` also scales total delivered damage (more ticks in contact), so the longer
  Frag cloud partially offsets its low damageFactor — total-damage ordering was kept sane
  (dedicated ArmPen > cluster-AP; see damage-profile.spec pins).
- All numbers live in `projectileDesigns`/`damageProfiles` literals — trivially tunable after
  play-testing.
