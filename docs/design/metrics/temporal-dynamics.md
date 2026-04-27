# Temporal Dynamics Metrics

Measures how engagement distributes over time — across game phases and between
stations. A game can have perfect dependency structure but still fail if
everyone is idle at the same time.

## Metric 13: Handoff Edges per Trigger

Counts how many verbal handoff edges activate when a specific trigger fires.
Scoreable from the dynamics tables. See [triggers.md](triggers.md) for the
trigger taxonomy (command triggers vs alert triggers).

**How to count:**
For each trigger (a game state change that activates cross-station communication),
count how many information locks or verbal dependencies activate.

**Example — "new enemy contact" alert trigger (EE):**
| Handoff | Stations | Count |
|---------|----------|-------|
| Science scans → announces faction + type | Sci→All | 1 |
| Science deep scans → announces shield freq number | Sci→Weapons | 1 |
| Science deep scans → announces beam freq number | Sci→Weapons | 1 |
| Relay announces if contact is within hacking range | Relay→Captain | 1 |
| Captain sets target priority | Captain→Weapons | 1 |
| Engineering asked about power readiness | Captain→Eng | 1 |
| **Total handoff edges** | | **6** |

**Example — "new enemy contact" alert trigger (SW current):**
| Handoff | Stations | Count |
|---------|----------|-------|
| Signals sees contact on long-range radar (if scan were working) | Sig→Captain | 1 |
| Captain sets target priority | Captain→Weapons | 1 |
| **Total handoff edges** | | **2** |

**Direction:** higher = more stations talk per event. Comparing edge counts
for the same trigger type between EE and SW directly quantifies the comms gap.

**Range:** 0–(stations × stations). Practically 0–~10 per trigger.

**What it reveals:**
- Low edges per trigger = stations can act independently during that event
  (weak comms forcing).
- High edges per trigger = the event generates a burst of conversation
  (strong comms forcing, but watch for bottlenecks if all edges are serial).

Classify triggers as command or alert to see whether top-down or bottom-up
events drive more communication.

## Metric 14: Phase Coverage per Station

Fraction of total game time each station is **actively engaged** (has a task
requiring attention or a decision to make).

**How to score:**
For each station, list its tasks from the dynamics table. Map each to the
phase(s) where it's relevant. Score:

| Activity level | Score |
|---------------|-------|
| Active decision-making or mini-game | 1.0 |
| Monitoring with occasional intervention | 0.5 |
| Idle (nothing to do, nothing to watch) | 0.0 |

**Formula:** `coverage(station, phase) = weighted_activity_score / phase_duration`

**Direction:** higher = less idle time at this station in this phase.

**Range:** 0.0–1.0.

**Known EE failures:**
- Engineering in cruise: ~0.2 (power set, nothing to monitor, no damage)
- Relay in explored sectors: ~0.3 (probes placed, comms exhausted)
- Science after full scan: ~0.2 (nothing left to scan)

**Table-scoreable proxy:** Count the rows in the dynamics table where a station
has ⚙ or 👁 in a given phase. Divide by total rows for that phase.
Stations with ⚙/👁 in <30% of combat rows or <20% of cruise rows are at risk.

## Metric 15: Demand Stagger

Measures whether station workload peaks alternate or synchronize, and whether
multiple stations go idle at the same time.

**Table-scoreable proxy (replaces the timeline-correlation approach, which
requires playtest data):**

For each station, classify its tasks by phase:
- **Combat-only tasks**: rows where Phase = `combat`
- **Cruise-only tasks**: rows where Phase = `cruise`
- **Both-phase tasks**: rows where Phase = `both`

A station with only combat tasks has zero cruise engagement by definition.

**Stagger score:** Count the number of stations with >70% of their tasks in a
single phase.

**Direction:** lower count = better stagger across phases.

**Range:** 0–(station count).

**Idle overlap (subsumed):** Count how many stations have no tasks in a given
phase. Multiple stations idle simultaneously means the bridge goes silent.

**Design response:** If stagger is poor, design tasks that activate during
the quiet phase for the idle stations. Engineering could have a
calibration/optimization task during cruise. Signals could have a passive
monitoring mini-game. The goal is **interleaved demand** — not every station
busy at once, but always *someone* busy.

## Relationship to Other Metrics

- High handoff triggers require high phase coverage (can't have
  handoffs if stations are idle).
- Good demand stagger requires cross-phase task distribution.
- These metrics are downstream of the dependency graph and information
  architecture — more edges active in a phase means more triggers and
  higher coverage.
- **Action demand** (Metric 8) interacts with trigger density: a trigger
  that fires many high-demand actions risks overload.
- **Interruption cost** (Metric 11) determines whether high trigger
  density is achievable — stations with costly mini-games can't respond
  to frequent triggers.
