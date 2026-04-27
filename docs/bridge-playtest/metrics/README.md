# Bridge Game Design Metrics

A framework for quantifying and comparing bridge game dynamics.
Use these metrics to measure Starwards against EmptyEpsilon (or any bridge sim)
and identify specific design gaps.

## Start here

The fastest way to use this framework: open the **comparison template** in
[pattern-coverage.md](pattern-coverage.md) and review your game against the
pattern and anti-pattern checklists. Then drill into specific metric groups
to understand *why* something is weak and *what* to change.

## How to use

1. Start with [overview.md](overview.md) for all 20 metrics at a glance.
2. Review the checklists in [pattern-coverage.md](pattern-coverage.md).
3. For any gap you want to understand, drill into the relevant metric group.
4. See [scoring-walkthrough.md](scoring-walkthrough.md) for a worked example
   applying metrics to a real row from the dynamics table.

## Index

### Framework
- [overview.md](overview.md) — Metric categories, what each measures, direction, range
- [scoring-walkthrough.md](scoring-walkthrough.md) — End-to-end worked example
- [triggers.md](triggers.md) — Trigger taxonomy: command vs alert triggers (design language)

### Metric Groups
- [dependency-graph.md](dependency-graph.md) — Station interconnection: edge count, types, weights, bidirectionality
- [information-architecture.md](information-architecture.md) — Data ownership, locks, auto-share leakage
- [action-architecture.md](action-architecture.md) — Action demand, input variety, failure gradient, interruption cost, skill ceiling
- [temporal-dynamics.md](temporal-dynamics.md) — Handoff edges per trigger, phase coverage, demand stagger
- [station-complexity.md](station-complexity.md) — Decision:monitoring ratio, cognitive mode variety
- [combined-metrics.md](combined-metrics.md) — Cognitive load, load alignment, captain leverage

### Design Review
- [pattern-coverage.md](pattern-coverage.md) — Comms-forcing pattern and anti-pattern checklists + comparison template

### Known Gaps
This framework measures **structural** properties of bridge dynamics. It does
not directly measure:
- **Emotional arc** — whether the session has crisis/relief beats that feel dramatic
- **Comms-layer error recovery** — what happens when a verbal handoff is missed
  (graceful degradation vs catastrophic failure)
- **Player satisfaction** — whether the metrics profile matches the role fantasy
  (a weapons officer who talks more than they shoot may score well but feel wrong)

These are named here so they're not forgotten. They resist formalization but
should be evaluated qualitatively during playtesting.
