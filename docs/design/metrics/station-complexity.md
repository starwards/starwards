# Station Complexity Metrics

Per-station aggregate measures of the player experience — what kind of
thinking is required and how much agency the player has. These are derived
from the action properties in action-architecture and the dependency
structure.

## Metric 16: Decision:Monitoring Ratio

Separate each station's tasks into two categories:

| Category | Definition | Example |
|----------|-----------|---------|
| **Decision** | Player chooses between options with tradeoffs. Outcome depends on choice quality. | Eng: which system to overpower. Weapons: which target to engage. |
| **Monitoring** | Player watches a value and reacts when it crosses a threshold. No choice — just attention. | Eng: heat bar approaching red. Pilot: collision warning. |

**Formula:** `ratio = decision_count / (decision_count + monitoring_count)`

**Per station, per phase.** A station can be decision-heavy in combat
and monitoring-heavy in cruise.

**Direction:** higher = more agency, lower = more passive.

**Range:** 0.0–1.0.

**What the ratio means:**
| Ratio | Experience |
|-------|-----------|
| >0.6 | High-agency — player feels in control, may be overwhelmed |
| 0.3–0.6 | Balanced — decisions punctuate monitoring |
| <0.3 | Passive — player is mostly watching |
| 0.0 | Dashboard — no decisions, just surveillance |

## Metric 17: Cognitive Mode Variety

Count distinct *thinking modes* the player uses, independent of physical input.

| Mode | What the player is thinking about |
|------|----------------------------------|
| **Optimizing** | Balancing competing resources (power vs coolant) |
| **Reacting** | Responding to sudden changes (damage, new contact) |
| **Planning** | Sequencing future actions (repair priority, warp prep) |
| **Communicating** | Formulating information for another station |
| **Pattern-matching** | Solving a puzzle or aligning a signal |

**Direction:** higher = more varied cognitive experience.

**Range:** 0–5 (number of modes in the taxonomy).

**Why it matters:**
A station with 3 physical input types (slider, toggle, spatial) but only 1
cognitive mode (all optimizing) feels repetitive despite physical variety.
Conversely, a station that requires optimizing, reacting, and planning but
does it all through sliders feels monotonous physically. Both dimensions
contribute to engagement — physical variety is measured in action-architecture
(Metric 9), cognitive variety here.

## Relationship to Other Metrics

- Decision:monitoring ratio feeds into **cognitive load** (Metric 18).
- Cognitive mode variety combines with **physical input variety** (Metric 9)
  to give a full picture of station engagement diversity.
- Both metrics are downstream of **action architecture** — the actions available
  at a station determine what decisions exist and what cognitive modes are
  exercised.
- Decision:monitoring ratio interacts with **phase coverage** (Metric 14) —
  a station that is monitoring-only in cruise has low coverage even if the
  screen is active.
