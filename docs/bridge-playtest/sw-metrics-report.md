# Starwards — Full Metrics Report (4-Station Layout, Current Build)

Scored against the 20-metric framework. Configuration: **Pilot**, **Weapons**,
**Bridge Engineering**, **Signals** + floating **Captain** (consoleless).

All scores derived from the SW dynamics table, station gap analyses, interdependency
matrix, and current codebase. Where features are not yet built (⬜), scored as
absent — the report measures what exists, not what's planned.

---

## Group 1: Dependency Graph (Metrics 1–4)

### Metric 1: Weighted Edge Count

| From → To | Edge | Type | Recurrence |
|-----------|------|------|------------|
| Eng → Pilot | Power for thrusters/warp/maneuvering/radar | resource-flow | continuous |
| Eng → Pilot | Warp frequency (ECR only) | info-push | per-session (~1×) |
| Eng → Weapons | Power for chainGun/tubes/magazine/radar | resource-flow | continuous |
| Eng → Weapons | Coolant allocation (heat management) | resource-flow | continuous |
| Eng → Signals | Power for /radar (shared subsystem) | resource-flow | continuous |
| Eng → Cap | Capability forecast (verbal) | info-push | per event |
| Signals → Pilot | Scan-level gating on pilot radar | info-push | per contact |
| Signals → Weapons | Scan-level gating on tactical radar | info-push | per contact |
| Pilot → Eng | Combat exposure → damage → Eng workload | resource-flow | per combat event |
| Pilot → Weapons | Ship orientation (implicit, needed for hits) | positioning | continuous |
| Weapons → Eng | Weapons activity → energy drain → heat | resource-flow | continuous |
| Cap → Pilot | Orders (heading, warp, dock) | command | per decision |
| Cap → Weapons | Orders (target priority) | command | per decision |
| Cap → Eng | Orders (power priority) | command | per decision |
| Cap → Signals | Orders (scan priority — ⬜ not actionable yet) | command | per decision |
| Pilot → Cap | Position/heading report | info-push | per event |
| Weapons → Cap | ❌ nothing mechanical | — | — |
| Signals → Cap | Threat picture (verbal) | info-push | per event |

**Total: 17 directed edges** (11 mechanical + 5 verbal/command + 1 dead edge).

Note: Weapons → Cap has no content. Weapons → anyone has no outbound edge
except the implicit heat/energy drain back to Engineering.

**Score: 17 edges. Comparable to EE's 18, but several are weaker.**

The key difference from EE: SW has no per-encounter information locks that
generate fresh handoff content. Most info-push edges fire once or are continuous
(no recurrent discrete events).

### Metric 2: Edge Type Weight Fraction

| Type | Count | Fraction |
|------|-------|----------|
| resource-flow | 7 | 0.41 |
| info-push | 4 | 0.24 |
| command | 4 | 0.24 |
| positioning | 1 | 0.06 |
| auto-push | 0 | 0.00 |
| action-effect | 0 | 0.00 |

**Score: Resource-flow dominated (0.41).** The game is heavily built around
the power/coolant/heat loop. Info-push and command are tied at 0.24 each.
No action-effect edges exist because scan initiation and hacking are not built.
No auto-push edges exist (which is actually good — no comms bypasses from
automatic data sharing).

**Compared to EE:** EE has a more even distribution (0.28/0.28/0.17/0.11/0.11/0.06).
SW is more resource-centric and less information-centric.

### Metric 3: Bidirectionality Score

| Pair | A→B | B→A | Bidirectional? |
|------|-----|-----|---------------|
| Eng ↔ Pilot | 2 edges (power, freq) | 1 edge (damage/heat) | Yes |
| Eng ↔ Weapons | 2 edges (power, coolant) | 1 edge (heat) | Yes |
| Eng ↔ Signals | 1 edge (power to /radar) | 0 | No — one-way |
| Pilot ↔ Weapons | 1 edge (orientation) | 0 | No — one-way |
| Signals ↔ Pilot | 1 edge (scan gating) | 0 | No — one-way |
| Signals ↔ Weapons | 1 edge (scan gating) | 0 | No — one-way |
| Cap ↔ Pilot | 1 command | 1 report | Yes |
| Cap ↔ Eng | 1 command | 1 report | Yes |
| Cap ↔ Signals | 1 command | 1 report | Yes (weak — Signals can't act on orders yet) |
| Cap ↔ Weapons | 1 command | 0 (❌ Weapons returns nothing) | No — one-way |

**Bidirectional pairs: 5 of 10.**

**Score: 0.50** — significantly lower than EE's 0.80.

Four one-way relationships are structural problems:
- **Eng → Signals**: Signals has no return effect on Engineering
- **Pilot → Weapons**: Weapons never feeds back to Pilot
- **Signals → Pilot/Weapons**: downstream only, no request channel
- **Cap → Weapons**: Weapons is a pure consumer of Captain orders

### Metric 4: In/Out Degree per Station

| Station | In-degree | Out-degree | Total | Character |
|---------|-----------|------------|-------|-----------|
| Pilot | 3 | 3 | 6 | Balanced |
| Weapons | 4 (highest in) | 1 (lowest out — only heat back to Eng) | 5 | **Pure sink** |
| Engineering | 4 | 6 (highest out) | 10 | Primary supplier |
| Signals | 2 | 3 | 5 | Light participant |
| Captain | 4 | 4 | 8 | Balanced coordinator |

**Score: Weapons out-degree = 1 is the critical finding.** Weapons takes from
Engineering (power, coolant), Pilot (orientation), Signals (scan level), and
Captain (orders) but returns only energy drain/heat to Engineering. It supplies
nothing unique to the bridge.

---

## Group 2: Information Architecture (Metrics 5–7)

### Metric 5: Exclusive Data Domains per Station

| Station | Exclusive domains | Count |
|---------|------------------|-------|
| Engineering | Per-system power detail, coolant allocation, per-system heat, defectible details, energy pool, warp frequency | 6 |
| Signals | Long-range contacts (50–250km), ⬜ scan results (not actionable yet) | 1 (effectively) |
| Pilot | Armor plate status (shared with Eng) | 0 |
| Weapons | Ammo inventory | 1 |
| Captain | (none — no console) | 0 by design |

**Score: Eng=6, Signals=1, Weapons=1, Pilot=0, Captain=0.**

Engineering is the richest information source — 6 exclusive domains. But unlike
EE's Operations overload (9 domains), this is appropriate for one station.

Signals should be the intel source but currently has only 1 effective exclusive
domain (long-range contacts). Once scan/hack jobs land, this grows to ~3–4.

Weapons having 1 exclusive domain (ammo) is minimal. Pilot having 0 means it
contributes no unique data to verbal exchange.

### Metric 6: Information Lock Count

| Data | Source (A) | Consumer (B) | Lock? |
|------|-----------|-------------|-------|
| Warp frequency | Eng (ECR) | Pilot (warp level) | Yes |
| Per-system power detail | Eng | Cap (planning) | Yes |
| Scan level (⬜ once actionable) | Signals | Pilot/Weapons (radar gating) | Partial — auto-applied, not verbal |

**Per-pair counts:**
| Pair | Locks |
|------|-------|
| Eng → Pilot | 1 |
| Eng → Cap | 1 |
| All others | 0 |

**Game-wide total: 2 information locks** (3rd is partial — scan level auto-applies
without verbal exchange, so it's not a true lock).

**Compared to EE: 2 vs 6.** This is the single largest structural gap. EE's
per-encounter frequency handoffs (shield freq, beam freq) plus the Helms→Weapons
arc action-gate create 6 locks. SW has no equivalent per-encounter mechanism.

### Metric 7: Auto-Share Leakage

| Data | Visible at | Bypass type |
|------|-----------|-------------|
| Scan level color-coding | All radars after scan | Auto-applied to radar rendering |
| System status (filtered) | Pilot, Weapons, Signals (own systems) | Filtered view — not full bypass |
| Armor plate status | Pilot + Eng | Shared display |

**Auto-shared items: 2–3** (depending on how you count filtered system status).

**Leakage ratio:** 2 / (2 + 2) = **0.50** — same as EE, but for different reasons.
In SW, the main bypass is scan-level auto-application to radars. The data crosses
from Signals to Pilot/Weapons without verbal handoff. If Signals had to verbally
report "I've upgraded that contact to BASIC", it would create a forced handoff.

---

## Group 3: Action Architecture (Metrics 8–12)

### Metric 8: Action Demand per Station

| Station | Action | Demand | Score |
|---------|--------|--------|-------|
| **Pilot** | Thrust/strafe/boost (WASD/gamepad) | Precision | 3 |
| | Rotation (Q/E/axis) | Precision | 3 |
| | Afterburner activation | Timed | 2 |
| | Warp up/down | Trivial | 1 |
| | Toggle dock | Trivial | 1 |
| | Anti-drift, brakes | Timed | 2 |
| **Weapons** | Fire chain gun | Timed | 2 |
| | Load/select ammo (chain gun) | Trivial | 1 |
| | Fire torpedo tube | Timed | 2 |
| | Load/select ammo/tube (torpedo) | Trivial | 1 |
| | Cycle/clear target | Trivial | 1 |
| | Toggle filters | Trivial | 1 |
| **Engineering** | Power slider per system (multiple systems) | Combinatorial | 4 |
| | Coolant ratio per system (finite pool) | Combinatorial | 4 |
| | ⬜ Repair (back-door slider, no skill gate) | Trivial | 1 |
| **Signals** | Zoom in/out | Trivial | 1 |
| | Cycle/clear target | Trivial | 1 |
| | ⬜ Scan initiation (not built) | — | — |
| | ⬜ Hack initiation (not built) | — | — |

**Average demand per station:**
| Station | Actions | Avg demand | Character |
|---------|---------|------------|-----------|
| Pilot | 6 | 2.0 | Precision-dominated — flight sim feel |
| Weapons | 6 | 1.33 | Mostly trivial — button farm |
| Engineering | 3 (2 real + 1 placeholder) | 3.0 | Combinatorial — resource juggling |
| Signals | 2 (only zoom + target) | 1.0 | ⬜ Nearly empty — waiting for scan/hack |
| Captain | 0 | — | Voice only |

**Finding:** Pilot is the most demanding per-action (precision flight controls).
Engineering matches EE's pattern (high demand, few actions). Weapons is trivial.
Signals has almost nothing to do — only 2 trivial actions exist.

### Metric 9: Physical Input Variety per Station

| Station | Input types present | Count |
|---------|-------------------|-------|
| Pilot | Slider (thrust axes), Spatial (gamepad analog), Timing (afterburner, anti-drift), Toggle (dock, modes) | 4 |
| Weapons | Cycle/select (target, ammo type), Timing (fire), Toggle (filters, auto-load) | 3 |
| Engineering | Slider (power ×N, coolant ×N) | 1 |
| Signals | Cycle/select (target, zoom) | 1 |
| Captain | (none) | 0 |

**Score: Pilot=4, Weapons=3, Engineering=1, Signals=1, Captain=0.**

Engineering's input variety is even lower than EE (2 → 1) because SW has no
repair crew dispatch mechanic (spatial click on ship map). It's pure sliders.

### Metric 10: Failure Gradient per Action

| Action | Station | Gradient | Score |
|--------|---------|----------|-------|
| Flight (thrust/rotation) | Pilot | Continuous | 3 |
| Afterburner | Pilot | Continuous (any burn duration helps) | 3 |
| Warp level | Pilot | Continuous (any level moves you) | 3 |
| Chain gun fire | Weapons | Continuous (partial hits deal partial damage) | 3 |
| Torpedo fire | Weapons | Binary (hit or miss, no partial) | 1 |
| Target selection | Weapons | Binary (selected or not) | 1 |
| Power allocation | Eng | Continuous | 3 |
| Coolant allocation | Eng | Continuous | 3 |
| ⬜ Repair | Eng | ⬜ unknown (placeholder slider = continuous) | 3 |
| ⬜ Scan | Signals | ⬜ not built | — |
| ⬜ Hack | Signals | ⬜ not built | — |

**Average by station:**
| Station | Avg gradient | Character |
|---------|-------------|-----------|
| Pilot | 3.0 | All continuous |
| Weapons | 2.0 | Mixed — chain gun continuous, torpedoes binary |
| Engineering | 3.0 | All continuous |
| Signals | — | ⬜ Not scorable |

**Finding:** SW scores better than EE on failure gradient for existing actions.
Pilot and Engineering are all-continuous. The chain gun's continuous nature
(partial hits) is stronger than EE's beam auto-fire (which is also continuous
but less player-controlled). Only torpedoes are binary.

**Risk:** When scan/hack mini-games are designed, they could introduce binary
outcomes (like EE's). The failure gradient metric should inform that design —
aim for partial/continuous outcomes.

### Metric 11: Interruption Cost per Action

| Action | Station | Cost | Reasoning |
|--------|---------|------|-----------|
| Flight controls | Pilot | Low | Ship drifts on current vector; no penalty for hands-off |
| Afterburner | Pilot | Low | Fuel pauses; resume anytime |
| Warp | Pilot | None | Warp continues at current level |
| Chain gun | Weapons | None | Loading continues in background |
| Torpedoes | Weapons | None | Tube loading continues |
| Target cycling | Weapons | None | Current target stays locked |
| Power/coolant | Eng | None | Sliders stay at current position |
| ⬜ Repair | Eng | ⬜ unknown | Depends on design |
| Zoom/target | Signals | None | Radar stays at current zoom |
| ⬜ Scan | Signals | ⬜ unknown | **Critical design choice** |
| ⬜ Hack | Signals | ⬜ unknown | **Critical design choice** |

**By station:**
| Station | Typical cost | Comms compatibility |
|---------|-------------|-------------------|
| Pilot | None–Low | High |
| Weapons | None | High |
| Engineering | None | High |
| Signals | None (current); ⬜ TBD | Currently high; **at risk** |

**Finding:** Current SW has universally low interruption cost. Every station can
talk freely while performing their tasks. This is better than EE (where Ops
hacking creates comms islands).

**Design warning:** The scan and hack mini-games for Signals are the biggest
interruption cost risk. If they're designed like EE's (absorbing, state-losing
on interrupt), they'll create the same Solo Minigame anti-pattern. Design them
with pausable/resumable state.

### Metric 12: Skill Ceiling per Action

| Action | Station | Ceiling | Reasoning |
|--------|---------|---------|-----------|
| Flight (thrust/rotation/strafe) | Pilot | Deep | Newtonian physics; anti-drift mastery; approach angles; speed management |
| Afterburner | Pilot | Moderate | Fuel management, timing |
| Chain gun aim | Weapons | Deep | Leading targets, burst timing, range management |
| Torpedo targeting | Weapons | Moderate | Tube selection, range estimation |
| Power balancing | Eng | Deep | Anticipating demand, optimizing heat curves |
| Coolant allocation | Eng | Deep | Zero-sum pool optimization under changing conditions |
| ⬜ Scan | Signals | ⬜ TBD | |
| ⬜ Hack | Signals | ⬜ TBD | |

**By station:**
| Station | Overall ceiling | Character |
|---------|----------------|-----------|
| Pilot | Deep | Flight mastery is the station's core identity |
| Weapons | Moderate–Deep | Aiming skill; less deep than Pilot |
| Engineering | Deep | Same pattern as EE — anticipation and optimization |
| Signals | ⬜ TBD | Depends entirely on mini-game design |
| Captain | Deep | Crew coordination; situational awareness |

**Finding:** Pilot has a deeper mechanical skill ceiling than EE's Helms (Newtonian
physics vs point-and-click heading). This is a strength. Engineering matches EE.
Weapons has moderate-to-deep ceiling from aiming (EE's Weapons has less aiming
skill — beams auto-fire).

---

## Group 4: Temporal Dynamics (Metrics 13–15)

### Metric 13: Handoff Edges per Trigger

SW has fewer defined triggers than EE. Scoring observable triggers:

| Trigger | Type | Handoff edges | Stations involved |
|---------|------|--------------|-------------------|
| **New contact detected** | alert | 2 | Signals sees on long-range → verbal to Cap. Cap sets priority → Weapons. (No scan data to hand off — ⬜ scan not built.) |
| **Warp sequence** | command | 3 | Cap orders warp. Eng sets frequency → verbal to Pilot. Pilot engages warp level. |
| **Power priority change** | command | 2 | Cap → Eng (change power). Eng → Cap (confirm). |
| **System overheat** | alert | 2 | Eng → Cap (system overheating). Cap → station (ease off). |
| **Combat engagement** | command | 2 | Cap → Weapons (engage target). Cap → Pilot (heading). |
| **Damage event** | alert | 2 | Eng sees damage → Cap. Cap → Eng (repair priority — ⬜ no repair action). |

**Averages:**
| Type | Avg edges | Range |
|------|-----------|-------|
| Command triggers | 2.3 | 2–3 |
| Alert triggers | 2.0 | 2 |

**Compared to EE: Commands 2.3 vs 3.3, Alerts 2.0 vs 4.0.**

SW generates roughly half the handoff density per trigger. The main cause:
no per-encounter information locks. In EE, "new contact" fires 6 edges because
it cascades through scan → freq → dial. In SW, "new contact" fires 2 edges
because scan data doesn't flow mechanically yet.

### Metric 14: Phase Coverage per Station

| Station | Cruise | Combat | Transition |
|---------|--------|--------|------------|
| **Pilot** | 0.6 (warp, heading, docking — active flight) | 0.9 (continuous flight + afterburner + evasion) | 0.5 |
| **Weapons** | 0.1 (nothing to do except monitor radar) | 0.9 (chain gun + torpedoes + targeting) | 0.1 |
| **Engineering** | 0.4 (power tuning, warp freq) | 0.8 (heat management, power juggling, ⬜ repair) | 0.3 |
| **Signals** | 0.3 (long-range monitoring, ⬜ scan not built) | 0.2 (⬜ no combat tasks built) | 0.1 |
| **Captain** | 0.4 (navigation, warp coordination) | 0.8 (target priority, damage triage) | 0.3 |

**Finding:** Two critical coverage gaps:

1. **Weapons in cruise = 0.1.** Weapons has literally nothing to do outside combat.
   No scanning, no probes, no utility tasks. This is worse than EE's Tactical (0.3).

2. **Signals in combat = 0.2.** Once scan/hack are built this will improve, but
   currently Signals has no combat role. The player watches contacts on radar
   with no ability to act.

### Metric 15: Demand Stagger

| Station | Combat-only tasks | Cruise-only tasks | Both-phase tasks | >70% single phase? |
|---------|------------------|------------------|-----------------|-------------------|
| Pilot | 1 (afterburner) | 3 (warp, dock, warp freq reception) | 3 (flight, heading) | No — balanced |
| Weapons | 5 (chain gun, torpedoes, ammo, target, filters) | 0 | 1 (radar monitoring) | **Yes — combat-only** |
| Engineering | 3 (heat, repair, damage) | 1 (warp freq) | 3 (power, coolant, energy) | No — but combat-biased |
| Signals | 0 | 0 | 2 (zoom, target cycling) | No — but empty in both |
| Captain | 0 | 0 | all verbal | No |

**Stagger score: 1** (Weapons exceeds 70% combat-only).

**Idle overlap:** In cruise, both Weapons AND Signals are near-idle simultaneously.
Two of four console stations go quiet. In combat, Signals is still near-idle
(⬜ scan/hack not built). This means at least one station is always underloaded
regardless of phase.

---

## Group 5: Station Complexity (Metrics 16–17)

### Metric 16: Decision:Monitoring Ratio per Station

| Station | Decisions | Monitoring | Ratio | Experience |
|---------|-----------|-----------|-------|-----------|
| **Pilot** | Heading, speed, warp level, afterburner timing, dock timing | Radar contacts, system status | 5:2 → **0.71** | High-agency |
| **Weapons** | Target selection, ammo type, fire timing, filter toggles | Radar, ammo counts, loading bars | 4:3 → **0.57** | Balanced |
| **Engineering** | Power allocation, coolant allocation, ⬜ repair priority | Heat monitoring, system health, energy level | 3:3 → **0.50** | Balanced |
| **Signals** | Target selection | Radar monitoring (long-range), target info readout | 1:2 → **0.33** | Passive (⬜ decisions not built) |
| **Captain** | Target priority, heading, power priority, warp decisions | Verbal reports | 4:1 → **0.80** | Very high-agency |

**Finding:** Signals at 0.33 is dangerously close to "passive dashboard."
The player mostly watches the long-range radar and cycles targets. No decisions
with consequences exist at this station yet. Once scan/hack land, this should
rise to ~0.6.

### Metric 17: Cognitive Mode Variety per Station

| Station | Modes present | Count |
|---------|--------------|-------|
| **Pilot** | Reacting (contacts, damage), Optimizing (speed/heading tradeoffs), Planning (approach vectors), Communicating (position reports) | 4 |
| **Weapons** | Reacting (new contacts, damage), Optimizing (ammo conservation), Planning (target priority), Communicating (⬜ weak — nothing to report) | 3 (Communicating barely present) |
| **Engineering** | Optimizing (power/coolant tradeoffs), Reacting (heat spikes, damage), Planning (pre-positioning for warp), Communicating (capability forecast) | 4 |
| **Signals** | Reacting (new contacts) | 1 (⬜ scan/hack would add Pattern-matching + Communicating) |
| **Captain** | Planning (mission), Communicating (orders), Reacting (alerts), Optimizing (priorities) | 4 |

**Score: Pilot=4, Eng=4, Cap=4, Weapons=3, Signals=1.**

Signals at 1/5 cognitive modes is critically weak — the player is doing nothing
but reactive monitoring.

---

## Group 6: Combined Metrics (Metrics 18–20)

### Metric 18: Cognitive Load per Station

| Station | External load | Internal load | Combined |
|---------|-------------|--------------|----------|
| **Pilot** | Medium (receives orders from Cap; coordinate with Weapons for heading) | Medium–High (continuous precision flight; multiple control axes) | **Balanced–Heavy** |
| **Weapons** | Low (receives target orders from Cap; minimal cross-station input) | Medium (target cycling + fire timing; no mini-games) | **Light** |
| **Engineering** | Medium (receives context from all; reports to Cap) | Medium–High (power/coolant optimization across multiple systems) | **Balanced–Heavy** |
| **Signals** | Low (⬜ has nothing to report; receives scan orders it can't act on) | Low (zoom + target cycling only) | **Under-loaded** ⚠️ |
| **Captain** | High (receives reports from all; issues orders to all) | Low (no screen tasks) | **Coordinator** |

**Finding:** Signals is under-loaded. Low external + Low internal puts it in the
⚠️ zone. The player has neither screen work nor meaningful verbal participation.

Weapons is "Light" — not under-loaded, but not balanced either. It receives
orders but has minimal verbal return obligations and no demanding mini-games.

### Metric 19: Load Alignment Ratio per Station

| Station | External tasks | Internal tasks | Total | Ratio | Character |
|---------|---------------|---------------|-------|-------|-----------|
| **Pilot** | 2 (receive warp freq, receive heading orders) | 6 (flight controls, warp, dock, afterburner) | 8 | **0.25** | Screen-heavy |
| **Weapons** | 1 (receive target orders) | 6 (fire, load, select, target, filter) | 7 | **0.14** | Screen-heavy → anti-pattern territory |
| **Engineering** | 3 (receive context, report capability, receive orders) | 3 (power, coolant, ⬜ repair) | 6 | **0.50** | Balanced |
| **Signals** | 1 (report contacts — ⬜ barely actionable) | 2 (zoom, target) | 3 | **0.33** | Screen-heavy (but screen is empty) |
| **Captain** | 5 (all orders + all reports) | 0 | 5 | **1.00** | Pure coordinator |

**Fantasy alignment check:**
- Pilot at 0.25: Matches fantasy. Pilot should be flying, not talking.
- Weapons at 0.14: **Too low.** The weapons officer is almost purely solo — they
  receive an occasional target order and then work their screen alone. In EE,
  Weapons is 0.44 (talks to Helms for arcs + Ops for freq). SW Weapons has no
  equivalent verbal channel.
- Engineering at 0.50: Good match. Same as EE.
- Signals at 0.33: **Wrong for role fantasy.** Signals should be the bridge's
  eyes and voice (like EE's Operations) — ratio should be 0.5–0.7. Currently
  the player has nothing to communicate because scan/hack aren't built.
- Captain at 1.00: Perfect.

### Metric 20: Captain Leverage

| Decision type | Total | Captain strong | Captain weak |
|--------------|-------|---------------|-------------|
| Target priority | 1 | 1 (strong) | 0 |
| Heading/destination | 1 | 1 (strong) | 0 |
| Power allocation | 1 | 0 | 1 (weak) |
| Warp decision | 1 | 1 (strong) | 0 |
| Scan priority (⬜ not actionable) | 1 | 0 | 0 (dead — can't influence what doesn't work) |
| ⬜ Hack priority | 0 | 0 | 0 |
| ⬜ Repair priority | 0 | 0 | 0 |
| Ammo type | 1 | 0 | 1 (weak — Weapons knows inventory) |
| Coolant tradeoff | 1 | 0 | 1 (weak) |

**Totals:** 7 scorable decision points. Strong: 3. Weak: 3. Dead: 1.

**Captain leverage = (3 × 1.0 + 3 × 0.5) / 7 = 4.5 / 7 = 0.64**

**Compared to EE: 0.64 vs 0.75.**

Lower because fewer decision points exist (7 vs 12) — scan/hack/repair
priorities are not yet actionable. The Captain has fewer things to decide about.
When scan/hack/repair land, leverage should rise to ~0.73 (adding 3–4 strong
influence decisions).

---

## Summary Dashboard

| # | Metric | Score | vs EE | Assessment |
|---|--------|-------|-------|-----------|
| 1 | Edge count | 17 | 22 | **Significantly fewer** — missing arc negotiation + info cascades |
| 2 | Edge type fraction | resource-heavy (0.41) | info-push leads (0.32) | Too resource-centric; needs more info edges |
| 3 | Bidirectionality | 0.50 (5/10) | 0.80 (8/10) | **Much worse** — 5 one-way relationships |
| 4 | In/out degree | Weapons out=1 | Hlm=10, Ops=10, balanced | **Weapons is a dead-end sink** |
| 5 | Exclusive domains | Eng=6, Sig=1, Wep=1 | Ops=9, Eng=3, Wep=2 | Eng strong; Signals/Weapons empty |
| 6 | Info locks | 2 | 6 | **Critical gap — no per-encounter locks** |
| 7 | Auto-share leakage | 0.50 | 0.45 | Comparable |
| 8 | Action demand | Pilot=2.0, Eng=3.0 | Hlm=1.5, Ops=2.25, Eng=3.0 | Pilot higher than EE Helms |
| 9 | Physical input variety | Pilot=4, Eng=1, Sig=1 | Hlm/Wep/Ops=4, Eng=2 | Eng and Signals monotonous |
| 10 | Failure gradient | Pilot=3, Eng=3 | Ops=1, Eng=3 | Better than EE for existing actions |
| 11 | Interruption cost | All None–Low | Ops=Low–Med | Better than EE — no comms islands |
| 12 | Skill ceiling | Pilot=Deep, Eng=Deep | Hlm=Deep, Eng=Deep | Comparable |
| 13 | Handoff edges/trigger | Avg 2.2 | Cmd=3.8, Alt=5.3 | **Half the density** — no cascade triggers |
| 14 | Phase coverage | Wep cruise=0.1, Sig combat=0.2 | Wep cruise=0.1, Eng=0.2 | **Worse** — two stations near-idle |
| 15 | Demand stagger | 1 (Weapons combat-only) | 1 (Weapons combat-only) | Same pattern, SW has double idle overlap |
| 16 | Decision ratio | Sig=0.33 | All >0.50 | **Signals is passive** |
| 17 | Cognitive variety | Sig=1/5 | All 4/5 | **Signals has 1 mode** |
| 18 | Cognitive load | Signals=Under-loaded | Ops=Heavy | Opposite problem — SW underloads, EE overloads |
| 19 | Load alignment | Wep=0.14, Sig=0.33 | Wep=0.44, Ops=0.33 | **SW Weapons far too solo** |
| 20 | Captain leverage | 0.64 | 0.75 | Lower — fewer decision points exist |

## Top 5 Structural Findings

1. **Signals station is hollow.** Cognitive load = Under-loaded. Cognitive variety =
   1/5. Decision ratio = 0.33. Phase coverage in combat = 0.2. The station has a
   radar and a target selector — nothing else. Scan and hack mini-games are the
   highest-priority design work.

2. **Weapons is a pure sink.** Out-degree = 1 (only heat back to Eng). Zero exclusive
   domains to share. Load alignment = 0.14 (barely talks). Weapons takes from the
   bridge and returns nothing. Needs an outbound information flow — weapon status
   reporting, target intel, or supply chain participation.

3. **No per-encounter information locks.** SW has 2 info locks (both fire ≤1× per
   session). EE has 5 (2 fire every engagement). This is the root cause of low
   handoff density (2.2 vs 3.5 per trigger). Designing a recurrent numerical
   handoff — a number that changes per engagement and must be spoken — is the
   single highest-leverage design move.

4. **Low bidirectionality (0.50 vs 0.80).** Five station pairs are one-way only.
   Signals has no return channel to anyone. Weapons has no return channel to
   Captain or Pilot. These are structural dead ends where communication can only
   flow downhill.

5. **Cruise phase has double idle overlap.** Both Weapons (0.1) and Signals (0.2)
   are near-idle in cruise. Two of four console stations have nothing to do
   between combat encounters. This is worse than EE's single-station cruise
   problem (Engineering only).
