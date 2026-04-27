# EmptyEpsilon — Full Metrics Report (5-Role Layout)

Scored against the 20-metric framework. 5-role config matching the SW baseline:
**Helms** (=SW Pilot), **Weapons**, **Engineering**, **Operations** (Science+Relay
merged, =SW Signals), **Captain** (consoleless).

All scores derived from the EE dynamics table, trigger catalog, and source-verified
research dossiers in this folder.

---

## Group 1: Dependency Graph (Metrics 1–4)

### Metric 1: Weighted Edge Count

| From → To | Edge | Type | Recurrence |
|-----------|------|------|------------|
| Ops → Weapons | Shield frequency number | info-push | per encounter |
| Ops → Weapons | Beam frequency number | info-push | per encounter |
| Ops → Helms | Waypoint distance | info-push | per jump |
| Ops → Helms | Contact identification (auto) | auto-push | per contact |
| Ops → Helms+Weapons | Beam arcs (auto) | auto-push | per deep scan |
| Ops → Helms | Hack: request hold position within 5U | action-gate | per hack |
| Ops → Cap | Threat picture + sector intel | info-push | per event |
| Eng → Helms | System effectiveness (engines, warp, maneuver) | resource-flow | continuous |
| Eng → Weapons | System effectiveness (beams, shields, missiles) | resource-flow | continuous |
| Eng → Ops | Power to reactor → global energy | resource-flow | continuous |
| Eng → Ops | Crew unhacks own systems | action-effect | per hack received |
| Eng → Cap | Capability forecast | info-push | per event |
| Helms → Eng | Energy drain + heat (engines) | resource-flow | continuous |
| Helms → Weapons | Ship heading → target in arc | positioning | continuous |
| Helms → Cap | Position/heading report | info-push | per event |
| Weapons → Eng | Energy drain + heat (beams, missiles) | resource-flow | continuous |
| Weapons → Helms | Arc requests ("hold heading", "tube faces aft") | action-gate | per engagement |
| Weapons → Cap | Combat status, target report | info-push | per event |
| Cap → Helms | Orders (heading, warp, jump, dock) | command | per decision |
| Cap → Weapons | Orders (target, fire, shield freq timing) | command | per decision |
| Cap → Eng | Orders (power priority) | command | per decision |
| Cap → Ops | Orders (scan, probe, hack, comms) | command | per decision |

**Total: 22 directed edges** (14 mechanical + 4 verbal/command + 4 auto/info).

### Metric 2: Edge Type Weight Fraction

| Type | Count | Fraction |
|------|-------|----------|
| info-push | 7 | 0.32 |
| resource-flow | 5 | 0.23 |
| command | 4 | 0.18 |
| auto-push | 2 | 0.09 |
| action-gate | 2 | 0.09 |
| action-effect | 1 | 0.05 |
| positioning | 1 | 0.05 |

**Score: Even distribution.** Info-push and resource-flow share the lead.

### Metric 3: Bidirectionality Score

| Pair | A→B | B→A | Bidirectional? |
|------|-----|-----|---------------|
| Ops ↔ Helms | 2 (distance, contact ID) | 0 | No |
| Ops ↔ Weapons | 2 (shield freq, beam freq) | 0 | No |
| Ops ↔ Eng | 1 (energy via reactor) | 1 (unhack) | Yes (weak) |
| Ops ↔ Cap | 1 (intel) | 1 (orders) | Yes |
| Eng ↔ Helms | 1 (power to engines) | 1 (heat from engines) | Yes |
| Eng ↔ Weapons | 1 (power to weapons) | 1 (heat from weapons) | Yes |
| Eng ↔ Cap | 1 (forecast) | 1 (orders) | Yes |
| Helms ↔ Weapons | 1 (heading for arcs) | 1 (arc requests) | **Yes — restored by split** |
| Helms ↔ Cap | 1 (position report) | 1 (orders) | Yes |
| Weapons ↔ Cap | 1 (combat status) | 1 (orders) | Yes |

**Bidirectional pairs: 8 of 10. Score: 0.80.**

Two one-way pairs remain: Ops→Helms and Ops→Weapons (Operations supplies data
but receives nothing mechanical back).

### Metric 4: In/Out Degree per Station

| Station | In-degree | Out-degree | Total | Character |
|---------|-----------|------------|-------|-----------|
| Helms | 7 (highest in) | 3 | 10 | Heavy consumer (movement + arcs target) |
| Weapons | 6 | 3 | 9 | Consumer (freq + arcs + power) |
| Operations | 3 | 7 (highest out) | 10 | Primary data supplier |
| Engineering | 3 | 5 | 8 | Balanced supplier |
| Captain | 4 | 4 | 8 | Balanced coordinator |

**Score: Ops and Helms are highest-degree (10 each).** Helms is the biggest
consumer (7 in) — it receives heading orders, power, arc requests, distance,
contact ID, beam arcs, and hack-hold requests. Operations is the biggest
supplier (7 out). The distribution is more balanced than 4-station layout
(where Tactical had 9 in as a single merged sink).

---

## Group 2: Information Architecture (Metrics 5–7)

### Metric 5: Exclusive Data Domains per Station

| Station | Exclusive domains | Count |
|---------|------------------|-------|
| Operations | Long-range contacts, freq graphs, enemy system health, database, sector map, waypoint distances, comms log, reputation, probe positions | 9 (⚠️ Ops merge) |
| Engineering | Per-system power/coolant/heat breakdown, repair crew positions, system health detail | 3 |
| Weapons | Current target lock, missile tube status, shield toggle state | 2 |
| Helms | Current heading (controlled), combat maneuver cooldown | 1 |
| Captain | (none — no console) | 0 by design |

### Metric 6: Information Lock Count

| Pair | Locks |
|------|-------|
| Ops → Weapons | 2 (shield freq, beam freq) |
| Ops → Helms | 1 (waypoint distance) |
| Ops → Cap | 1 (enemy system health) |
| Eng → Cap | 1 (power detail) |
| Helms → Weapons | 1 (action-gate: heading for arcs) |

**Game-wide: 5 info locks + 1 action-gate = 6 total.**

### Metric 7: Auto-Share Leakage

| Data | Visible at |
|------|-----------|
| Ship energy | Helms, Weapons, Eng, Ops |
| Shield strength | Weapons HUD |
| Scan color-coding | All radars |
| Enemy beam arcs | Helms + Weapons |
| Alert level | All stations |

**Leakage ratio:** 5 / (5 + 6) = **0.45.**

---

## Group 3: Action Architecture (Metrics 8–12)

### Metric 8: Action Demand per Station

| Station | Avg demand | Character |
|---------|------------|-----------|
| Helms | 1.5 | Mixed: trivial + precision (arc holding) |
| Weapons | 1.4 | Mostly trivial with timed elements |
| Operations | 2.25 | Wide range: trivial to combinatorial |
| Engineering | 3.0 | Few actions, all combinatorial |
| Captain | 1.0 | Voice only |

### Metric 9: Physical Input Variety per Station

| Station | Count | Types |
|---------|-------|-------|
| Helms | 4 | Spatial, Slider, Toggle, Timing |
| Weapons | 4 | Cycle/select, Toggle, Timing, Slider |
| Operations | 4 | Alignment, Puzzle, Spatial, Text/menu |
| Engineering | 2 | Slider, Spatial |
| Captain | 0 | — |

### Metric 10: Failure Gradient per Station

| Station | Avg | Character |
|---------|-----|-----------|
| Helms | 3.0 | All continuous |
| Weapons | 2.0 | Mixed (dials continuous, missiles binary) |
| Operations | 1.0 | All binary |
| Engineering | 3.0 | All continuous |

### Metric 11: Interruption Cost

| Station | Cost | Comms compatibility |
|---------|------|-------------------|
| Helms | None–Low | High |
| Weapons | None | High |
| Operations | Low–Medium | Moderate (hacking = comms island) |
| Engineering | None | High |

### Metric 12: Skill Ceiling

| Station | Ceiling | Key mastery |
|---------|---------|------------|
| Helms | **Deep** | Arc management while dodging |
| Weapons | Moderate–Deep | Frequency optimization, missile timing |
| Operations | Moderate–Deep | Scan speed, puzzle solving |
| Engineering | Deep | Anticipatory power management |
| Captain | Deep | Crew coordination, doctrine |

---

## Group 4: Temporal Dynamics (Metrics 13–15)

### Metric 13: Handoff Edges per Trigger

| Trigger | Type | Edges |
|---------|------|-------|
| New enemy contact | alert | 8 |
| Jump drive escape | command | 9 |
| Beam engagement | command | 5 |
| Power priority | command | 3 |
| Shield freq change | command | 4 |
| System overheat | alert | 4 |
| Dock | command | 3 |
| Hack initiated | command | 2 |

**Averages: Commands=3.8, Alerts=5.3** (+20–30% vs 4-station layout).

### Metric 14: Phase Coverage per Station

| Station | Cruise | Combat |
|---------|--------|--------|
| Helms | 0.5 | 0.8 |
| Weapons | 0.1 | 1.0 |
| Operations | 0.5 | 0.8 |
| Engineering | 0.2 | 0.9 |
| Captain | 0.4 | 1.0 |

### Metric 15: Demand Stagger

**Stagger score: 1** (Weapons >70% combat-only).

**Idle overlap:** Weapons (0.1) + Engineering (0.2) both near-idle in cruise.

---

## Group 5: Station Complexity (Metrics 16–17)

### Metric 16: Decision:Monitoring Ratio

| Station | Ratio | Experience |
|---------|-------|-----------|
| Helms | 0.67 | High-agency |
| Weapons | 0.71 | High-agency |
| Operations | 0.71 | High-agency |
| Engineering | 0.50 | Balanced |
| Captain | 0.83 | Very high-agency |

### Metric 17: Cognitive Mode Variety

All stations: **4/5.** Pattern-matching unique to Operations.

---

## Group 6: Combined Metrics (Metrics 18–20)

### Metric 18: Cognitive Load

| Station | External | Internal | Combined |
|---------|----------|----------|----------|
| Helms | Medium | Medium | **Balanced** ✓ |
| Weapons | Medium | Medium | **Balanced** ✓ |
| Operations | Medium | High | **Heavy** |
| Engineering | Medium | Medium–High | **Balanced–Heavy** |
| Captain | High | Low | **Coordinator** |

### Metric 19: Load Alignment Ratio

| Station | Ratio | Character |
|---------|-------|-----------|
| Helms | 0.38 | Screen-heavy (appropriate for pilot) |
| Weapons | 0.44 | Balanced (talks to Helms + Ops regularly) |
| Operations | 0.33 | Screen-heavy (too low for "eyes and voice" role) |
| Engineering | 0.50 | Balanced |
| Captain | 0.88 | Pure coordinator |

### Metric 20: Captain Leverage

12 decision points. Strong: 6. Weak: 6.

**Captain leverage = 0.75**

---

## Summary Dashboard

| # | Metric | Score | Assessment |
|---|--------|-------|-----------|
| 1 | Edge count | 22 | Dense for 5 roles |
| 2 | Edge type fraction | 0.05–0.32 | Info-push leads slightly; good variety |
| 3 | Bidirectionality | 0.80 (8/10) | Strong; Ops→Helms and Ops→Weapons one-way |
| 4 | In/out degree | Hlm=10, Ops=10, Wep=9, Eng/Cap=8 | Helms biggest consumer, Ops biggest supplier |
| 5 | Exclusive domains | Ops=9, Eng=3, Wep=2, Hlm=1 | Ops overloaded by merge |
| 6 | Info locks | 6 (5 info + 1 action-gate) | Strong; arc dependency adds value |
| 7 | Auto-share leakage | 0.45 | Moderate; energy pool biggest offender |
| 8 | Action demand | Eng=3.0, Ops=2.25, Hlm=1.5, Wep=1.4 | Good range |
| 9 | Physical input variety | Hlm/Wep/Ops=4, Eng=2 | Eng monotonous |
| 10 | Failure gradient | Ops=1.0 (all binary), others 2–3 | Ops weakest |
| 11 | Interruption cost | Ops=Low–Med, others=None–Low | Ops hacking = comms island |
| 12 | Skill ceiling | All Moderate–Deep; Helms=Deep | Universally strong |
| 13 | Handoff edges/trigger | Cmd=3.8, Alert=5.3 | Strong density |
| 14 | Phase coverage | Wep cruise=0.1, Eng cruise=0.2 | Cruise is dead |
| 15 | Demand stagger | 1 (Weapons combat-only) | Cruise idle overlap |
| 16 | Decision ratio | 0.50–0.83 | All above passive threshold |
| 17 | Cognitive variety | 4/5 all stations | Strong |
| 18 | Cognitive load | Ops=Heavy, others=Balanced | Ops overloaded |
| 19 | Load alignment | Wep=0.44, Hlm=0.38, Ops=0.33 | Ops should be more verbal |
| 20 | Captain leverage | 0.75 | Strong |

## Top 5 Structural Findings

1. **The Helms/Weapons split is a clear win.** +22% edges, Helms gains deep
   skill ceiling (arc management), Weapons talks significantly more (0.44 vs
   0.25 in merged layout), degree distribution becomes balanced.

2. **Operations is still overloaded.** 9 exclusive domains, Heavy cognitive load,
   all-binary failure gradients. The Ops merge concentrates two stations' work
   into one player regardless of the Helms/Weapons split.

3. **Cruise phase is still dead.** Weapons (0.1) and Engineering (0.2) near-idle.
   No cruise-phase tasks exist for these stations.

4. **Ops→Helms and Ops→Weapons are one-way.** Neither station supplies anything
   back to Operations. This is the remaining bidirectionality gap.

5. **Auto-share leakage (0.45) is moderate.** Energy pool visible at 4 stations
   remains the biggest comms bypass.
