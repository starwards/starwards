# Information Architecture Metrics

Measures how information is distributed across stations — the raw material
for verbal communication. Tightly linked to the Information Lock and
Asymmetric Readout comms-forcing patterns.

## Metric 5: Exclusive Data Domains per Station

Count information types visible at **exactly one** station.
These are the domains that *must* be verbally shared to reach anyone else.

**What counts as a domain:**
A domain is a distinct category of game-relevant information, not individual
data points. "Enemy shield frequency" is one domain even though each enemy
has a different number.

**Examples (EE):**
| Station | Exclusive domains | Count |
|---------|------------------|-------|
| Science | Long-range contacts (>5U), freq graphs, enemy system health, database | 4 |
| Relay | Sector map, waypoint distances, comms log, reputation, probe positions | 5 |
| Engineering | Per-system power/coolant/heat breakdown, repair crew positions | 2 |
| Helms | (none — everything Helms sees is also visible elsewhere) | 0 |
| Weapons | (none — same issue) | 0 |

**Direction:** higher = more unique verbal contributions from this station.
A station with 0 exclusive domains has nothing unique to say — it's a pure
information consumer. Very high counts on a single station mean that player
becomes the bridge's data server (EE's 4-station Operations with 9 merged
domains demonstrates this).

**Range:** 0–∞ per station.

## Metric 6: Information Lock Count

Strict subset of exclusive domains. An information lock exists when:
1. Data lives at station A (exclusive domain)
2. The action knob that consumes that data lives at station B
3. There is no UI pathway from A to B — verbal relay is the only bridge

**Formula:** Count the (A, B, data) triples that satisfy all three conditions.

**Scope:** per station-pair (primary), game-wide aggregate (secondary).
Five locks concentrated between the same two stations is structurally
different from five locks distributed across five pairs.

**Examples (EE):**
| Data | Source (A) | Consumer (B) | Lock? |
|------|-----------|-------------|-------|
| Enemy shield frequency | Science | Weapons (beam dial) | ✅ yes |
| Enemy beam frequency | Science | Weapons (shield dial) | ✅ yes |
| Waypoint distance | Relay | Helms (jump distance) | ✅ yes |
| Enemy system health | Science | Captain (priority) | ✅ yes |
| Per-system power detail | Engineering | Captain (planning) | ✅ yes |

**Direction:** higher per pair = more forced verbal handoffs between those
stations. Higher game-wide = more total comms-forcing moments. But locks
concentrated on one pair create a serial dependency — station B constantly
waits for station A.

**Range:** 0–∞ per pair, 0–∞ game-wide.

## Metric 7: Auto-Share Leakage

Count information items visible at 2+ stations **without** verbal handoff.
These are comms bypasses — data that crosses station boundaries automatically.

**Examples (EE):**
| Data | Visible at | Bypass type |
|------|-----------|-------------|
| Ship energy (global) | Helms, Weapons, Engineering | HUD element on multiple screens |
| Shield strength | Weapons, Helms (HUD) | Duplicate display |
| Scan color-coding | All radars after simple scan | Auto-pushed |
| Enemy beam arcs | Helms + Weapons after deep scan | Auto-pushed |

**Scoring:** `leakage_ratio = auto_shared_items / (auto_shared + lock_count)`

**Direction:** higher = more comms bypasses. Some auto-sharing is fine
(alert level, basic contact visibility) — it prevents the game from being
*all* verbal overhead. But each auto-share is a missed verbal handoff opportunity.

**Range:** 0–∞. Compare against lock count (Metric 6) for context.

## Relationship to Dependency Graph

- Every information lock creates at least one directed edge in the dependency graph
  (type: info-push or action-gate).
- Every exclusive domain that is NOT a lock is a potential edge that hasn't been
  wired up yet — "this station knows something useful but nobody mechanically
  needs it." This is a design opportunity.
- Auto-share leakage *removes* edges from the dependency graph — data that
  could have been a verbal handoff is instead automatic.
