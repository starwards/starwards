# Combined Metrics

Composite metrics that synthesize dependency graph, information architecture,
temporal dynamics, and station complexity into actionable design indicators.

## Metric 18: Cognitive Load per Station (Ordinal)

Total demand on a player, combining external (comms) and internal (tasks) load.
Scored on an ordinal scale rather than a precise formula, because the inputs
(handoff frequency, decision density) carry too much estimation uncertainty
for multiplicative combination to be meaningful.

**Scoring rubric:**

Rate **external load** (comms + coordination demands):
| Level | Criteria |
|-------|---------|
| **Low** | ≤1 incoming dependency active in this phase; rarely asked for input |
| **Medium** | 2–3 incoming dependencies; regular verbal exchanges |
| **High** | 4+ incoming dependencies; near-constant verbal demands |

Rate **internal load** (screen + task demands):
| Level | Criteria |
|-------|---------|
| **Low** | Mostly monitoring; ≤1 active decision per minute |
| **Medium** | Mix of monitoring and decisions; occasional mini-game |
| **High** | Continuous decision-making or demanding mini-game; frequent context-switches |

**Combined cognitive load:**

| External \ Internal | Low | Medium | High |
|-------|-----|--------|------|
| **Low** | Under-loaded ⚠️ | Light | Specialist |
| **Medium** | Observer | **Balanced** ✓ | Heavy |
| **High** | Coordinator | Heavy | Overloaded ⚠️ |

**Direction:** balanced across stations = healthier design. Large differences
between stations in the same phase mean one player is overwhelmed while
another is bored.

**Range:** 3×3 ordinal grid (9 cells).

## Metric 19: Load Alignment Ratio

Balance between external (comms, coordination) and internal (screen, tasks) work.

**How to score:**
Count the station's tasks from the dynamics table. Classify each as:
- **External**: requires verbal exchange with another station to perform
- **Internal**: performed entirely on own screen

**Formula:**
```
load_alignment(station) = external_tasks / total_tasks
```

**Interpretation:**
| Ratio | Station character | Example |
|-------|------------------|---------|
| 0.8–1.0 | Pure coordinator — almost no screen work | Captain |
| 0.5–0.7 | Balanced — splits attention between screen and room | Ideal for most stations |
| 0.3–0.5 | Screen-heavy — mostly internal, some comms | Acceptable for a specialist |
| 0.0–0.2 | Solo player — barely talks to anyone | Anti-pattern territory |

**Direction:** 0.0 = pure screen work, 1.0 = pure comms. Neither extreme
is inherently wrong — Captain should be near 1.0, a specialist station
could be lower. The number describes the station's character.

**Range:** 0.0–1.0.

**Design lever:** to move toward external, add information locks or verbal
dependencies. To move toward internal, add mini-games or monitoring tasks.

**Fantasy alignment check:** After computing the ratio, ask: does this match
what the player expects from this role? A Weapons officer at 0.7 (mostly
talking) may score "balanced" but feel wrong — the fantasy is shooting, not
reporting. A Signals officer at 0.7 may feel right — the fantasy is being
the bridge's eyes and voice. The ratio is a structural measure; role fantasy
is a qualitative overlay.

## Metric 20: Captain Leverage

Fraction of total bridge decisions that the Captain can meaningfully influence.

**How to count:**
1. List every **decision point** across all stations (from decision:monitoring
   ratio analysis).
2. For each, ask: does the Captain's input change the outcome?
   - **Yes (strong):** The station would choose differently with vs without
     Captain guidance. Example: Weapons choosing target priority based on
     Captain's mission objective.
   - **Yes (weak):** The station could decide alone but Captain input improves
     quality. Example: Engineering allocating power without knowing combat plan.
   - **No:** The decision is fully internal to the station. Example: scan
     mini-game slider alignment — Captain can't help.

**Formula:**
```
captain_leverage = (strong_influence × 1.0 + weak_influence × 0.5) / total_decisions
```

**Direction:** higher = Captain matters more. Very low means the Captain role
is ceremonial. Very high means stations can't act without Captain approval.

**Range:** 0.0–1.0.

**What the extremes look like:**
- Low: too many decisions are internal mini-games, or stations have enough
  information to decide autonomously, or too few tradeoffs need priority-setting.
- High: stations feel like puppets — every action requires Captain approval,
  creating a bottleneck.

## Relationship Between Combined Metrics

```
cognitive_load (per station)
    ├── if imbalanced across stations → redesign dependency graph
    └── if uniformly too low → add tasks or dependencies

load_alignment (per station)
    ├── if too internal → add information locks or verbal deps
    ├── if too external → add mini-games or monitoring
    └── check against role fantasy (does the ratio feel right for this role?)

captain_leverage (game-wide)
    ├── if too low → add cross-station tradeoffs that need prioritization
    └── if too high → give stations more autonomous decision authority
```

These three metrics together tell you:
1. **Is each player busy enough?** (Metric 18: cognitive load)
2. **Is each player talking enough?** (Metric 19: load alignment)
3. **Does the Captain matter?** (Metric 20: captain leverage)

Combined metrics draw from all upstream groups: dependency graph and
information architecture (what edges and locks exist), action architecture
(how demanding the interactions are), temporal dynamics (when load peaks),
and station complexity (decision density and cognitive variety).
