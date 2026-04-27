# Action Architecture Metrics

Root properties of atomic actions — state-affecting operations a player performs
at their station. Reading or reporting information is not an action; an action
changes the software game state. Each action has inherent properties independent
of when it fires or who depends on it.

Because triggers map to specific actions at specific stations, these properties
can be projected per trigger, per station, per phase.

## Metric 8: Action Demand

How much skill and attention a single atomic interaction requires.

**Taxonomy:**

| Demand | Character | Example |
|--------|-----------|---------|
| **Trivial** | No skill, just intent | Toggle, button press, menu select |
| **Timed** | Right action, right moment | Fire window, cooldown management |
| **Precision** | Continuous control toward a target | Slider alignment, signal tuning |
| **Combinatorial** | Multiple inputs coordinated | Power/coolant tradeoff across systems |

**Scoring:** trivial = 1, timed = 2, precision = 3, combinatorial = 4.

**Direction:** higher = more demanding per action. Neither extreme is inherently
good — a station with all-trivial actions is boring, but all-combinatorial is
exhausting. The mix matters more than the average.

**Range:** 1–4 per action, averaged per station.

**What it explains:**
Action demand is the root property behind several downstream metrics.
High-demand actions tend to have deeper skill ceilings (Metric 12), higher
interruption cost (Metric 11), and continuous failure gradients (Metric 10).
Trivial actions tend to have flat skill ceilings and binary outcomes. Knowing
the demand level explains *why* those downstream metrics score the way they do.

## Metric 9: Physical Input Variety

Count mechanically distinct input types per station.

| Type | What the player does physically |
|------|-------------------------------|
| **Slider/dial** | Drag continuous value |
| **Toggle** | Binary on/off |
| **Cycle/select** | Step through a list |
| **Puzzle** | Solve a self-contained challenge |
| **Alignment** | Tune a value to match a hidden target |
| **Spatial** | Click/interact on a map or floor plan |
| **Timing** | Act within a time window |
| **Text/menu** | Navigate conversation trees |

**Direction:** higher = more varied physical experience.

**Range:** 0–8 (number of types in the taxonomy).

## Metric 10: Failure Consequence Gradient

For each mini-game or discrete action, classify the outcome space:

| Gradient | Description | Example |
|----------|-----------|---------|
| **Binary** | Success or fail, nothing in between | EE scan: sliders either lock within 0.05 for 2s or they don't. EE hack: puzzle solved or not. |
| **Partial** | Degrees of success affect outcome quality | A scan that reveals ship class on partial success but full intel on complete success (not in EE — a design aspiration, underrepresented in existing bridge sims) |
| **Continuous** | Real-time feedback loop, no discrete success | Eng: power/coolant balancing (always active, never "done") |

**Scoring:** binary = 1, partial = 2, continuous = 3.

**Direction:** higher average across a station's tasks = more gradual outcomes,
less frustration from all-or-nothing results.

**Range:** 1–3 per task, averaged per station.

## Metric 11: Interruption Cost

How much progress is lost when a player stops a mini-game to handle a
verbal request from another station?

| Cost level | What happens on interrupt | Example |
|------------|-------------------------|---------|
| **None** | Task pauses, full state preserved | Monitoring (just look away and back) |
| **Low** | Task can be cancelled and restarted cheaply | EE scan: cancel button, restart from round 1 |
| **Medium** | Partial progress lost, must redo significant work | Puzzle halfway solved, state not saved |
| **High** | Interrupt causes negative consequence (damage, failure) | A mini-game that penalizes abandonment |

**Direction:** lower = easier for the player to respond to verbal requests
mid-task. A station whose primary task has high interruption cost becomes a
**comms island** — the player stops responding to protect their progress.
This is the structural cause of the Solo Minigame anti-pattern.

**Range:** none / low / medium / high (ordinal).

**Design consideration:** long tasks with high interruption cost are the worst
combination — the player is locked out of comms for extended periods.

## Metric 12: Skill Ceiling

Does player performance at a station improve meaningfully with practice?

**How to assess:**
For each station's primary tasks, ask:
- Can an experienced player do this measurably faster or better than a novice?
- Is there a visible skill progression that the player can feel?
- Does mastery create satisfying moments (the "smooth handoff" feeling)?

**Scoring:**
| Level | Description | Example |
|-------|-----------|---------|
| **Flat** | No meaningful improvement with practice | A timer-based task — same wait regardless of skill |
| **Moderate** | Experienced players are faster or more efficient | EE scan: experienced players align sliders in 5s vs novice 30s |
| **Deep** | Mastery enables qualitatively different play | EE freq handoff: veteran crew pre-communicates, cuts exchange to 2 words |

**Direction:** higher = more replay value and mastery progression.

**Range:** flat / moderate / deep (ordinal, per task).

**Why it matters:**
A bridge game is typically replayed many times (game nights, events).
Stations with flat skill ceilings feel the same on session 10 as session 1.
Stations with deep ceilings give players a reason to return and a sense of
growing expertise — which also creates natural mentoring dynamics between
experienced and novice crew members.

## Relationship to Other Metrics

- Action demand is the root property that explains downstream scores in
  failure gradient, interruption cost, and skill ceiling.
- Physical input variety feeds into **per-role input modality** (pattern coverage).
- Interruption cost determines whether a station can participate in the
  comms layer while doing internal work — directly affects **handoff triggers**
  (Metric 13) and **load alignment ratio** (Metric 19).
- Skill ceiling interacts with **phase coverage** (Metric 14) — a deep-ceiling
  task can keep a station engaged during otherwise idle phases.
- These properties are inputs to **station complexity** metrics (decision ratio,
  cognitive mode variety) and **combined metrics** (cognitive load, load alignment).
