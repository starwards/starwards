# Decision: plateDamage governs plate erosion only

**Date:** 2026-07
**Status:** Accepted. Partially superseded by [008](008-unconditional-surface-effect.md): the
surface scrape is now unconditional, so Hardened's external systems _are_ washed by HiExp blast
(at the reduced surface factor of [010](010-blast-size-and-surface-factors.md)).

## Context

After the damage-profile unification ([006](006-damage-profile-unification.md)), the per-armor
`plateDamage_<T>` factor multiplied **both** plate erosion and the system damage leaking through
broken/penetrated sections. So `2/0` (vulnerable) breached twice as fast _and_ hit systems twice
as hard afterwards, and Reactive's `plateDamage_Tandem: 4` existed purely to deliver ×4 system
damage (single-use cells pop regardless of the factor's magnitude).

This double-dipping contradicts the intended mental model: armor is worn down until its plates
are dead, and then the round's own damage reaches the systems. Armor quality should decide
_time to breach_, not scale what a round does after the breach.

## Decision

1. **`plateDamage_<T>` multiplies plate erosion only.** System damage applied through exposure
   (broken plates or penetration) is `damage × systemDamageFactor` of the ammo's profile —
   never scaled by the armor factor. `0` still means "the armor does not engage the hit".
2. **Reactive vs Tandem loses the ×4 system damage** (supersedes the ×4 in 006 item 8;
   `plateDamage_Tandem` is now `1`). The "critical" outcome is preserved structurally: the
   precursor pops the cells permanently (`singleUsePlates`) and `penetration_Tandem: 1`
   lands the main charge at full force — already the strongest outcome in the model.
3. **Hardened is resistant (not immune) to HiExp: `plateDamage_HiExp: 0.5`.** Blast grinds the
   slab down at half rate; ArmPen (2) remains the fast counter. This differentiates Hardened
   from Whipple, which stays the all-or-nothing standoff shield (HiExp blocked).

## Consequences

- Vulnerable matchups (`2/0`) breach twice as fast but post-breach system damage is the round's
  own — overall damage output vs vulnerable armor is lower than before.
- The plateDamage scale reads as pure erosion speed: 0 immune, 0.5 resistant, 1 normal,
  2 vulnerable; fractional values between are free to tune per armor model.
- Hardened vs HiExp moves off the blocked path: its plates now erode under blast, but its
  external systems are no longer scraped by the surface effect of blocked HiExp hits
  (blocked-path scrape only applies at `plateDamage 0`). Frag/Cluster remain the anti-external
  tools against Hardened.
- Balance shifts vs 006 (items 2 and 8 partially superseded); numbers remain trivial to tune in
  `configurations/armor-models.ts` after play-testing.
