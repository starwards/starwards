# Decision: surface effect applies regardless of armor (Reactive deflects)

**Date:** 2026-07
**Status:** Accepted. Partially superseded by [009](009-frag-mechanics-and-cluster-modes.md):
deflection covers deflectable types only (Frag scrapes Reactive too, so its blast immunity is no
longer total), and the Cluster damage type is dissolved. Scrape strength superseded by
[010](010-blast-size-and-surface-factors.md): `surfaceDamageFactor` × 0.05, not
25% × `systemDamageFactor`.

## Context

Surface-effect scrape (blast/shrapnel damaging hull-mounted systems at 25% strength) previously
applied only when the armor fully blocked the hit (`plateDamage 0`). This produced an inversion:
standard Composite armor protected external systems from Frag _better_ than the anti-blast
Whipple did, because engaging armor "shadowed" the externals until breached.

The fiction says otherwise: Composite is the basic hull layer, other armor models are layered
over it, and hull-mounted equipment (thrusters, guns, radar, docking, signals) always sits
_outside_ the plates. A blast washing over the hull reaches that equipment no matter which armor
the hull wears.

## Decision

1. **Surface-effect ammo (HiExp, Frag, Cluster) always scrapes external systems in the hit
   arc** — on blocked, engaging, and bypass paths alike — at the existing 25% ×
   `systemDamageFactor` strength, in addition to whatever the path itself does.
2. **Exception: armor with the new `deflectsSurfaceEffect` flag negates the scrape.** Reactive
   sets it: the ERA charge pushes the round/missile away before its blast develops. All other
   models (including pure Faraday) do not.

## Consequences

- Frag/Cluster fulfill their anti-external role against every armor model except Reactive;
  wrong-ammo fire vs wall armors (e.g. HiExp vs Whipple) still degrades surface equipment.
- Reactive is now the _strongest_ protection against blast weapons — full immunity including
  externals — balanced by single-use cells and the Tandem hard counter.
- Engaging paths double-dip externals slightly once plates break (scrape + exposure damage);
  accepted as "sustained blast fire is bad for surface equipment".
- `deflectsSurfaceEffect` is a per-armor-model design field (synced, tweakable), tunable in
  `configurations/armor-models.ts` without code changes.
