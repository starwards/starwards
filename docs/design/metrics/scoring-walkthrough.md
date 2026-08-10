# Scoring Walkthrough

End-to-end worked example: scoring one row from the Starwards dynamics table
across all applicable metrics.

## Source Row: "Warp Frequency"

From `bridge-dynamics-table.md`:

| Domain | Phase | Flow | Pattern | Status | Pilot | Weapons | Engineer | Signals | Captain |
|--------|-------|------|---------|--------|-------|---------|----------|---------|---------|
| **Warp frequency** | cruise | info | Info Lock | ✅ | — blind 🗣 must be told | — | ⚙ sets freq | — | 🗣 routes Eng→Pilot |

## Scoring

### Metric 1: Weighted Edge Count
This row creates **2 directed edges**:
- Eng → Pilot (info-push: frequency value). Recurrence: per-session (weight 1).
- Captain → Pilot (verbal: routes the information). Recurrence: per-session (weight 1).

Contribution to total: **+2 weighted edges**.

### Metric 2: Edge Type Weight Fraction
- Eng → Pilot: **info-push** (Eng proactively tells Pilot the frequency)
- Captain → Pilot: **info-pull** (Captain routes, but also Pilot may ask)

Both edges go into the type distribution denominator.

### Metric 3: Bidirectionality
Does Pilot → Eng exist for any domain? Yes (energy spend → heat from thrust).
So this pair is bidirectional. Score: no change (already bidirectional).

### Metric 4: In/Out Degree
- Eng: +1 out-degree (supplies freq to Pilot)
- Pilot: +1 in-degree (depends on Eng for freq)
- Captain: +1 out-degree (routes information)

### Metric 5: Exclusive Data Domains
Warp frequency is visible **only** on the Engineering screen.
Contributes +1 exclusive domain to Engineering's count.

### Metric 6: Information Lock Count
- Data (warp frequency) lives at Engineering.
- Action knob (warp level control) lives at Pilot.
- No UI pathway between them.

**This is an information lock.** Count: +1 lock (Eng, Pilot, warp-freq).

### Metric 7: Auto-Share Leakage
Warp frequency is NOT auto-shared. No leakage from this row. Good.

### Metric 8: Action Demand
Setting warp frequency is a **trivial** action — select from an enum.
Score: 1.

### Metric 9: Physical Input Variety
Setting frequency uses a **cycle/select** input type (choose from enum).
If Eng already has sliders and toggles, this adds variety.

### Metric 10: Failure Gradient
Binary — either the right frequency or the wrong one. Score: 1 (binary).

### Metric 11: Interruption Cost
Setting frequency takes <2 seconds and can be done anytime. Cost: **None**.

### Metric 12: Skill Ceiling
Flat — choosing a frequency doesn't get meaningfully faster with practice.
The decision quality might improve (learning which frequencies are efficient),
but the interaction itself has no skill curve.

### Metric 13: Handoff Triggers
This row activates during "warp sequence" trigger.
Contribution: +1 handoff edge (Eng must tell Pilot the frequency).

But warp frequency rarely changes mid-session, so this trigger fires
~1 time per session, not per encounter. This is why this row scores
only 🟡 (partial) for the Recurrent Numerical Handoff pattern — compare
to EE's shield frequency which rerolls per enemy ship.

### Metric 14: Phase Coverage
- Engineering: ⚙ in cruise phase → activity score 1.0 ✓
- Pilot: — in cruise (but has warp level control, so covered by other rows)
- Captain: 🗣 in cruise → activity score 0.5

### Metric 15: Demand Stagger
Warp frequency is a cruise-phase task for Engineering. If most of Eng's
other tasks are combat-only, this helps stagger. If Eng already has many
cruise tasks, this doesn't help.

### Metric 16: Decision:Monitoring
For Engineering: setting warp frequency is a **decision** (choose between
W770–W810Hz based on tactical situation). Score: +1 decision for Eng.

### Metric 17: Cognitive Mode Variety
Cognitive mode: **planning** (choosing frequency for upcoming travel).

### Metric 18: Cognitive Load
This row adds:
- External: +1 to Eng (must communicate to Pilot)
- Internal: +1 to Eng (must decide which frequency)
- External: +1 to Pilot (must receive and remember the number)

Small contribution. Doesn't change the ordinal tier by itself.

### Metric 19: Load Alignment
For Engineering: this is an external task (requires verbal handoff).
Moves Eng's ratio slightly toward external.

### Metric 20: Captain Leverage
Can the Captain influence frequency choice? **Yes (weak)** — Captain might
say "use frequency X for stealth" based on mission knowledge. Score: +0.5
to Captain leverage numerator.

## Summary for This Row

| Metric | Contribution |
|--------|-------------|
| Edge count | +2 (weight 1 each) |
| Edge types | +1 info-push, +1 info-pull |
| Bidirectionality | pair already bidirectional |
| Exclusive domains | +1 for Eng |
| Info locks | +1 (Eng→Pilot) |
| Auto-share leakage | 0 |
| Action demand | trivial (1) |
| Physical input variety | +1 cycle/select |
| Failure gradient | binary (1) |
| Interruption cost | none |
| Skill ceiling | flat |
| Handoff triggers | +1 per warp sequence |
| Phase coverage | cruise activity for Eng and Captain |
| Decision:monitoring | +1 decision for Eng |
| Cognitive mode variety | +1 planning |
| Patterns | Info Lock ✅, Recurrent Numerical Handoff 🟡 |

## Process Note

To score a full game, repeat this for every row in the dynamics table,
then aggregate per metric. Most rows will contribute to only 8–12 metrics,
not all 20. The walkthrough above is the densest case — warp frequency
touches almost everything because it's an information lock with a decision,
a verbal handoff, and a pattern instance.
