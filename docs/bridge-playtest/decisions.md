# Bridge Design Decisions

Confirmed decisions only. Candidates and drafts live in [`proposals.md`](proposals.md).

## 2026-05-03 — Armor types × ammo types as the per-fight Signals→Weapons handoff

**Decision.** Add variety in armor types and ammo types. Matching the right ammo for a target's armor becomes the per-encounter information dependency that EE gets from shield frequencies.

**Role implications.**
- **Signals**: scans the target, identifies armor type, voices it to Weapons.
- **Weapons**: receives the call, selects matching ammo, fires.
- Replaces the "shield frequency equivalent" slot in the gap-closing plan.

**Status.** Direction agreed (Daniel, 2026-05-03). Mechanics — number of armor/ammo classes, scan tier required to reveal type, partial-match damage curve — still to design.
