# Dependency Graph Metrics

Measures how stations are interconnected — the structural backbone of teamwork.
Source data: the bridge dynamics tables (one row = one or more directed edges).

## Metric 1: Weighted Edge Count

Count directed edges between stations, weighted by how often the dependency fires.

**Weight scale:**
| Recurrence | Weight | Example (EE) |
|------------|--------|-------------|
| Continuous | 3 | Power allocation affects all systems every tick |
| Per-encounter | 2 | Shield frequency handoff per new enemy |
| Per-session | 1 | Warp frequency set once |

**Formula:** `total_weight = Σ (edge_weight)` across all station pairs.

**Direction:** higher = denser interdependency web. But raw count alone is
misleading — a game with 20 continuous edges from Engineering to everyone is
dense but one-directional. Combine with bidirectionality and type distribution.

**Range:** 0–∞. No theoretical upper bound, but very high counts mean players
spend more time negotiating than acting.

## Metric 2: Edge Type Weight Fraction

Classify each edge into one of five types, then measure what fraction of
total edge weight each type contributes.

| Type | Definition | Example (EE) |
|------|-----------|-------------|
| **info-push** | A proactively sends data B needs | Science announces scan result |
| **info-pull** | B must ask A for data | Captain asks Engineering for status |
| **resource-flow** | A supplies a consumable/capacity to B | Engineering power allocation |
| **action-gate** | B cannot act until A completes something | Weapons can't optimize beams until Science scans |
| **positioning** | B's action requires A's physical state | Hacking requires Helms to keep ship within 5U |

**Formula:** `fraction(type) = Σ weight of edges of this type / Σ total edge weight`

**Direction:** more even distribution = more variety in how stations relate.

**Range:** 0.0–1.0 per type. All fractions sum to 1.0.

**What the distribution tells you:**
- Heavy resource-flow → Engineering-dominated game
- Heavy info-push/pull → conversation-dominated game
- Heavy action-gate → serial dependency chains (can feel like waiting)
- No positioning edges → stations are locationally independent (missed opportunity)
- No info-pull → Captain never needs to ask questions (Captain leverage drops)

## Metric 3: Bidirectionality Score

For each station pair (A, B), check:
- Edge A→B exists? Edge B→A exists?
- If both: bidirectional pair.
- If only one: unidirectional pair (asymmetry / sink risk).

**Formula:** `bidirectionality = bidirectional_pairs / total_connected_pairs`

**Direction:** higher = fewer sinks, more mutual dependency.

**Range:** 0.0–1.0.

A station pair where A→B exists but B→A doesn't means B is a sink
relative to A. The classic case: Weapons depends on Engineering (power)
but Engineering gets nothing back from Weapons except indirect heat —
is that enough to count as B→A?

**Counting rule:** indirect/implicit effects (e.g., "weapons firing causes
heat that Engineering must manage") count as edges, but at lower weight
than explicit dependencies. Suggested: indirect edges get half the weight
of direct ones.

## Metric 4: In-Degree / Out-Degree per Station

- **In-degree** (weighted): sum of incoming edge weights. How much this station
  *depends on* others.
- **Out-degree** (weighted): sum of outgoing edge weights. How much others
  *depend on* this station.

**What the numbers mean:**
- High out-degree, low in-degree = **supplier** (Engineering in both EE and SW)
- High in-degree, low out-degree = **sink** (Weapons in SW)
- Balanced = **hub** (good for teamwork feel)
- Captain should have high in-degree (receives reports) and moderate out-degree
  (issues orders) — but orders are verbal, not mechanical, so weight them lower.

**Direction:** balanced in/out across stations = healthier web. A station with
out-degree = 0 is a pure sink. A station with in-degree = 0 is fully independent.

**Range:** 0–∞ per station.

## Projection

All four metrics can be projected onto:
- **Phase** (cruise/combat): count only edges active in that phase
- **Edge type**: filter by info-push, resource-flow, etc.
- **Recurrence**: filter by continuous/per-encounter/per-session

This lets you ask: "In combat, how many positioning edges exist?" (EE: 1, SW: 0)
or "During cruise, which station has the highest out-degree?" (EE: Ops, SW: Eng).
