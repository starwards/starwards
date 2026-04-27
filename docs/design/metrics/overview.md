# Metrics Overview

Six metric groups, each measuring a different dimension of bridge game dynamics.
Three foundational groups (dependency graph, information architecture, action
architecture) feed into two derived groups (temporal dynamics, station complexity),
which all combine into composite metrics.

```
dependency-graph ───┐
                    ├──► temporal-dynamics ──┐
information-arch ───┤                       ├──► combined-metrics
                    ├──► station-complexity ─┘       ▲
action-architecture ┘                               │
                    └───────────────────────────────┘
```

## Summary Table

| # | Metric | Group | Compare by | What it measures | Direction | Range |
|---|--------|-------|------------|-----------------|-----------|-------|
| 1 | Edge count (weighted) | dependency-graph | game-wide | Interconnection density | higher = more interdependency | 0–∞ |
| 2 | Edge type weight fraction | dependency-graph | game-wide | Dependency variety | more even = more variety | 0.0–1.0 per type |
| 3 | Bidirectionality score | dependency-graph | per pair | Relationship symmetry | higher = fewer sinks | 0.0–1.0 |
| 4 | In/out degree per station | dependency-graph | per station | Station importance in the room | balanced across stations = healthier web | 0–∞ per station |
| 5 | Exclusive data domains | information-arch | per station | Information asymmetry depth | higher = more unique verbal contributions | 0–∞ per station |
| 6 | Information lock count | information-arch | per pair (primary), game-wide (secondary) | Hard comms-forcing moments | higher = more forced verbal handoffs | 0–∞ |
| 7 | Auto-share leakage | information-arch | game-wide | Comms bypass exposure | higher = more comms bypasses | 0–∞ |
| 8 | Action demand | action-architecture | per action | Skill/attention required per interaction | mix matters more than average | 1 (trivial) – 4 (combinatorial) |
| 9 | Physical input variety | action-architecture | per station | Mechanical input diversity | higher = more varied physical experience | 0–8 |
| 10 | Failure gradient | action-architecture | per mini-game | Outcome spectrum | higher = more gradual outcomes | 1 (binary) – 3 (continuous) |
| 11 | Interruption cost | action-architecture | per mini-game | Comms compatibility | lower = easier to respond to verbal requests | none / low / medium / high |
| 12 | Skill ceiling | action-architecture | per station | Mastery reward | higher = more replay value | flat / moderate / deep |
| 13 | Handoff edges per trigger | temporal-dynamics | per trigger type | Communication density per game event | higher = more stations talk per event | 0–(stations × stations) |
| 14 | Phase coverage | temporal-dynamics | per station × phase | Engagement breadth | higher = less idle time | 0.0–1.0 |
| 15 | Demand stagger | temporal-dynamics | game-wide | Workload alternation + idle overlap | lower count of single-phase stations = better stagger | 0–(station count) |
| 16 | Decision:monitoring ratio | station-complexity | per station | Engagement quality | higher = more agency, lower = more passive | 0.0–1.0 |
| 17 | Cognitive mode variety | station-complexity | per station | Thinking diversity | higher = more varied cognitive experience | 0–5 |
| 18 | Cognitive load (ordinal) | combined | per station | Total demand on player | balanced across stations = healthier design | Low–High × Low–High grid |
| 19 | Load alignment ratio | combined | per station | Internal vs external balance | 0.0 = pure screen, 1.0 = pure comms | 0.0–1.0 |
| 20 | Captain leverage | combined | game-wide | Captain role strength | higher = Captain matters more | 0.0–1.0 |

## Projection Dimensions

Any metric can be sliced by:

- **Phase**: cruise / combat / transition
- **Station**: per-station or per-station-pair
- **Dependency type**: info-push / info-pull / resource-flow / action-gate / positioning
- **Trigger type**: command / alert (see [triggers.md](triggers.md))
- **Recurrence**: continuous / per-trigger / per-session
