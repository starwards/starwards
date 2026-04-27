# EmptyEpsilon — Operational Trigger Catalog

Vanilla EmptyEpsilon mechanics only (daid/EmptyEpsilon, no scripted scenarios). Every row is a discrete game-state change that forces bridge comms.

**Taxonomy:**
- **command** — Captain-initiated, comms BEFORE the change. The bridge talks, then a station acts.
- **alert** — station-detected, comms AFTER the change. A station observes, then reports.
- **anticipated** — alerts that are predictable consequences of a named upstream trigger (command or alert), marked with the parent ID. Not a third category.

**Same event, multiple receivers** = one row, all receivers listed. **Phase** is when the trigger naturally occurs; "any" means it can fire in all phases.

Uncertainty is flagged with `[?]` and explained in the "Notes on uncertainty" section. Concepts EE *lacks* that would generate additional triggers in a richer sim are listed in the appendix.

---

## Trigger Table

### Command Triggers

| ID | Name | Anticip. | Origin | Receivers | State Change | Phase |
|----|------|----------|--------|-----------|--------------|-------|
| C-01 | Set Heading | — | Captain | Helms | Helms taps the radar to set a new bearing in degrees; impulse direction immediately updates. | any |
| C-02 | Engage Target | — | Captain | Weapons, Helms | Weapons selects target on radar (lock acquired); beams auto-fire when target enters arc; Helms maneuvers to keep target in arc. | engagement |
| C-03 | Hold Fire | — | Captain | Weapons | Weapons deselects target; beam auto-fire ceases; missile tubes remain loaded for next order. | engagement |
| C-04 | Initiate Jump | — | Captain | Helms, Engineering, Relay | Helms enters jump distance and triggers the drive; activation delay (~10s `[?]`) starts; ship teleports along current heading; energy cost scales with distance. | any |
| C-05 | Engage Warp | — | Captain | Helms | Helms moves warp slider above 0; ship enters FTL warp and drains the global energy pool continuously. | cruise, engagement |
| C-06 | Dock | — | Captain | Helms, Relay | Helms approaches a friendly/neutral station within its dock range and activates dock; engines and weapons lock; energy recharge, repair speed, and probe replenishment all rise. | recovery, cruise |
| C-07 | Undock | — | Captain | Helms | Helms activates undock; engines and weapons re-enable; docked bonuses cease. | docked |
| C-08 | Power Priority | — | Captain | Engineering | Engineering moves the power slider for a named subsystem; heat updates per `1.7^(power−1) − (1.01 + coolant×0.1)`; global energy draw shifts. | any |
| C-09 | Modulate Shield Frequency | — | Captain | Weapons | Weapons changes shield frequency dial; shields go offline for a calibration delay (~25s `[?]`) before re-engaging at the new frequency. | engagement |
| C-10 | Retune Beam Frequency | — | Captain | Weapons | Weapons changes beam frequency dial (0–20, 400–800 THz) to match enemy shield vulnerability reported by Science; damage output changes instantly with no downtime. | engagement |
| C-11 | Scan Order | — | Captain | Science | Science begins a slider-alignment mini-game on the target; the target's `scanning_complexity` (rounds required) and `scanning_depth` (attribute reveals) determine how many successful rounds are needed and what is unlocked. Faction/class reveal first; deeper rounds expose `shield_frequency` and `beam_frequency`. | any |
| C-12 | Launch Probe | — | Captain | Relay | Relay places a probe at a sector location (max 8 active); probe transits, then transmits 5U-radius short-range sensor data for `lifetime = 600s`. | cruise, engagement |
| C-13 | Link Probe to Science | — | Captain | Relay | Relay binds an active probe to Science's console; Science gains the probe's 5U sensor footprint as a remote view, including inside nebulae. | cruise |
| C-14 | Initiate Hack | — | Captain | Relay | Relay opens Lights Out or Minesweeper puzzle against a target within 1U; success raises target's `hacked_level` by ~+0.5 `[?]` (cap 1.0). | engagement |
| C-15 | Hail Target | — | Captain | Relay | Relay opens NPC comms interface and selects from the menu of scripted dialogue options. | any |
| C-16 | Request Reinforcements | — | Captain | Relay | Relay spends reputation via a station's comms menu to request allied ships or supply ships; an ally spawns and transits to the player's sector. | engagement, recovery |
| C-17 | Request Resupply | — | Captain | Relay | While docked, Relay selects missile types to rearm; reputation cost deducted; specified missile stock refilled to ship capacity. | docked |
| C-18 | Deploy Mine | — | Captain | Weapons | Weapons drops a mine from an aft tube; mine becomes a stationary proximity explosive. | engagement |
| C-19 | Load and Fire Missile | — | Captain | Weapons | Weapons loads a tube with a chosen missile type (Homing / Nuke / EMP / HVLI / Mine — load time per type, mines only in mine-capable tubes); missile fires when ready; type stock decrements by one. | engagement |
| C-20 | Designate Subsystem Target | — | Captain | Weapons | Weapons switches targeting mode from hull to a specific enemy subsystem; successful beam hits drain that subsystem's health rather than hull. | engagement |
| C-21 | Raise/Lower Shields | — | Captain | Weapons | Weapons toggles shield activation (`setShieldsActive()`); shields enable or disable instantly with no calibration delay. Distinct from C-09 (frequency change). | cruise, engagement |
| C-22 | Authorize Self-Destruct | — | Captain | Engineering | Captain orders self-destruct; Engineering presses the destruct activation on the Engineering console; confirmation codes are split across other stations (typically Helms/Weapons/Science/Relay each see one code) and must be read aloud and entered in sequence. Once codes match, countdown begins (A-23). | any |
| C-23 | Set Impulse Speed | — | Captain | Helms | Helms moves the impulse slider (−1.0 to +1.0); ship velocity changes immediately along the current heading. Distinct from C-01 (heading bearing). | any |
| C-24 | Place Waypoint | — | Captain | Relay, Helms | Relay places a numbered waypoint on the sector map (`addWaypoint()`); waypoint icon appears on every station's radar; Helms gains a navigable target. | any |
| C-25 | Set Alert Level | — | Captain | all stations | Captain calls `setAlertLevel()`; ship enters Normal / Yellow Alert / Red Alert state; main screen tints, alarm audio plays at Red Alert. Posture only — vanilla EE does NOT auto-raise shields, prime weapons, or change power priorities. | any |

### Alert Triggers

| ID | Name | Anticip. | Origin | Receivers | State Change | Phase |
|----|------|----------|--------|-----------|--------------|-------|
| A-01 | New Contact Detected | no | Science | Captain, Weapons, Helms | An unknown (gray) contact appears inside Science's `long_range = 30U` radar (or on Relay's sector map first; see A-15). | any |
| A-02 | Simple Scan Complete | yes (C-11) | Science | Captain, Weapons | First scan round resolves; contact's faction and ship class are now labeled on every station's radar. | any |
| A-03 | Deep Scan Complete | yes (C-11) | Science | Weapons, Helms, Captain | Final scan round resolves; target's shield_frequency and beam_frequency are exposed on Science's console; enemy beam firing arcs auto-publish to Helms and Weapons radars. | cruise, engagement |
| A-04 | System Overheat | yes (C-08) | Engineering | Captain; station responsible for the affected system (Weapons for beams/shields, Helms for engines/warp/jump) | A subsystem's temperature crosses overheat threshold; ~0.08 `[?]` health-fraction/s damage accrues until cooled. | engagement |
| A-05 | System Breakdown | yes (A-04, chained) | Engineering | Captain, station that owns the system | A subsystem's health drops to ≤ 0%; the system stops functioning entirely (engines off, shields fail, warp dies, etc.); Engineering must dispatch a repair crew. | engagement |
| A-06 | Hull Damage (critical) | yes (C-02) | Engineering | Captain | Hull health drops past a danger threshold; at hull = 0% the ship is destroyed; repair crews repair hull only slowly. | engagement |
| A-07 | Low Energy | yes (C-04, C-05, C-02, C-08, A-29) | Engineering, Helms, Weapons | Captain, Engineering | Global ship energy crosses a low-energy threshold; vanilla EE displays an explicit "Low energy" notification. `[?]` exact threshold not in public docs. | engagement, cruise |
| A-08 | Shield Down | yes (C-09) | Weapons | Captain, Helms, Engineering | Front or rear shield strength reaches 0% (from enemy fire); hull is directly exposed; Helms may need to rotate to bring the intact shield arc into the fire vector. | engagement |
| A-09 | Missile Type Depleted | yes (C-19) | Weapons | Captain, Relay | All units of one missile type (Homing / Nuke / EMP / HVLI / Mine) reach 0; that type is unavailable until C-17 resupply. | engagement, recovery |
| A-10 | Incoming NPC Hail | no | Relay | Captain | An NPC ship or station opens comms toward the player; Relay sees an incoming-comms indicator and must read the content to the Captain. | any |
| A-11 | Enemy Destroyed | yes (C-02, C-18, C-19) | Weapons, Science | Captain, Helms | Enemy ship is destroyed; contact removed from all radars; Weapons' lock clears; Science's scan list shrinks; Helms awaits next vector. | engagement |
| A-12 | Probe Arrived | yes (C-12) | Relay | Captain, Science | Launched probe reaches its placed location and begins transmitting 5U-radius sensor data; Science can now request a link. `[?]` no explicit "arrived" pop-up confirmed; visible as the probe's icon settling on the map. | cruise |
| A-13 | Probe Expired | yes (C-12) | Relay | Captain | A probe's 600s lifetime ends; the probe icon disappears; sensor coverage of that region is lost; Relay may relaunch (8-probe cap permitting). | cruise, engagement |
| A-14 | Ally / Station Distress | no | Relay | Captain | An NPC ally or friendly station transmits a distress message via the comms menu; Relay reads it; usually triggers a course or reinforcement decision. | any |
| A-15 | Sector Contact (Relay-only) | no | Relay | Captain, Science | Relay's sector map shows a contact derived from another friendly ship's short-range sensors that is beyond Science's 30U radar; Relay calls it out. | cruise |
| A-16 | Hack Successful | yes (C-14) | Relay | Captain, Weapons, Engineering | Relay completes the hacking puzzle; target's `hacked_level += ~0.5 [?]` (cap 1.0); target's `effective_power = power × coolant × (1 − hacked_level)` on the chosen system, matching `getSystemEffectiveness()`. | engagement |
| A-17 | Jump Complete | yes (C-04) | Helms | Captain, Science, Relay, Engineering | Ship reappears at the calculated distance along the heading; ~0.35 `[?]` heat-fraction added to the jump drive; Science loses old contacts and faces new ones; Relay's sector map repopulates. | any |
| A-18 | Own System Hacked | no `[?]` | Engineering | Captain, Relay | An enemy raises `hacked_level` on a player subsystem; Engineering sees `effective_power` drop on that row. Vanilla EE has no automatic recovery from hacking; scenarios script the reset via `setHacked(0)`. `[?]` Vanilla NPC AI rarely uses the player-facing hack puzzle. | engagement |
| A-19 | Waypoint Reached | no `[?]` | Helms | Captain, Relay | Ship reaches a Relay-placed waypoint; Helms reports arrival verbally; warp is typically disengaged here if used. `[?]` EE does not appear to fire a mechanical arrival event — the trigger is observational (Helms notices the waypoint icon overlap). | cruise |
| A-20 | Docked Confirmed | yes (C-06) | Helms | Captain, Relay, Engineering | Dock succeeds; engines/weapons lock; faster energy recharge and repair, probe stock replenished, resupply window opens for Relay. | recovery, docked |
| A-21 | Repair Complete | yes (A-05, chained) | Engineering | Captain, station that owns the system | Repair crew restores a subsystem's health to 100%; system resumes full function; Engineering redeploys crew. Crew movement is ~0.5 cells/s; repair is 0.007 health/s (~143s for a fully broken system). | engagement, recovery |
| A-22 | Entering Nebula | no | Science | Captain, Relay | Science's long-range radar blanks where a nebula occludes sensors; contacts inside are invisible until Relay places a probe (C-12) and links it (C-13). | cruise |
| A-23 | Self-Destruct Countdown Active | yes (C-22) | Engineering | all stations | Confirmation codes accepted; visible countdown clock starts at the configured value; ship is destroyed at T=0. | any |
| A-24 | Reputation Critically Low | yes (C-16, C-17) | Relay | Captain | Reputation pool drops to a level where further reinforcement / resupply requests are unavailable; Relay flags the limitation. | any |
| A-25 | Contact Lost | yes (C-04, C-05) for own-motion case; otherwise no | Science, Relay | Captain, Weapons | A previously tracked contact leaves Science's 30U radar (and is not covered by a probe or allied ship's sensors); only the last known position remains on the map. Note: when contact loss is caused by a nebula (A-22), A-22 supersedes this trigger. | any |
| A-26 | NPC Comms Response Received | yes (C-15) | Relay | Captain | A hailed NPC's reply arrives in the comms log; Relay reads or summarizes the response so the Captain can pick the next dialogue branch. | any |
| A-27a | Asteroid Field Detected | no | Science, Helms | Captain, Helms | An asteroid field appears on radar at collision distance; collision deals hull damage proportional to impact speed; Helms must alter course or reduce speed. | cruise, engagement |
| A-27b | Black Hole Detected | no | Science, Helms | Captain, Helms | A black hole appears within gravitational pull range on radar; applies continuous hull damage and pulls the ship toward the singularity; Helms must immediately apply thrust away. | cruise, engagement |
| A-27c | Mine Proximity Detected | no | Science, Helms | Captain, Helms, Weapons | A mine enters sensor range; vanilla `mine_trigger_range` ≈ 800m, blast radius ≈ 1000m; Helms avoids, Weapons may destroy with beams. | cruise, engagement |
| A-27d | Wormhole Detected | no | Science, Helms | Captain, Helms, Relay | A wormhole appears on radar; entering the event horizon teleports the ship to an unknown exit location; Relay must update the sector map; Helms avoids unless ordered to transit. | cruise, engagement |
| A-28 | Missile Tube Loaded | yes (C-19) | Weapons | Captain | A weapon tube finishes its load cycle; the chosen missile type is ready to fire; Weapons announces readiness and awaits fire authorization. | engagement |
| A-29 | EMP Hit Received | no | Engineering, Weapons | Captain, Engineering | An enemy EMP missile detonates in proximity; the ship's global energy pool drains sharply; shields may collapse; Engineering reports the energy drop and must re-prioritize power. | engagement |
| A-30 | Energy Depleted | yes (C-04, C-05, C-02, C-08, A-29) | Engineering, Helms | Captain, Engineering, Helms | Global ship energy reaches 0; propulsion, shields, and weapons lose power; Helms reports loss of maneuvering; Engineering must reduce subsystem power consumption to allow recharge. Distinct from A-07 (warning threshold) — this is the hard floor. | engagement, cruise |
| A-31 | Probe Cap Reached | yes (C-12) | Relay | Captain | All 8 probe slots are active; Relay cannot launch additional probes until one expires (A-13) or is deliberately abandoned; Relay flags the constraint when a new launch is ordered. | cruise, engagement |
| A-32 | Self-Destruct Detonation | yes (A-23, chained) | Engineering | all stations | Self-destruct countdown reaches T=0; ship is destroyed; crew is lost. Terminal event — no recovery possible. | any |
| A-33 | Friendly Destroyed | no | Science, Relay | Captain, Relay | An NPC ally or friendly station is destroyed; its icon is removed from all maps; Relay may need to revise reinforcement plans; Science's contact list shrinks. | engagement |
| A-34 | Coolant Depleted on System | yes (C-08, A-04) | Engineering | Captain, Engineering | A subsystem's coolant allocation is exhausted (all coolant reassigned elsewhere or total coolant pool insufficient); the system's heat dissipation rate falls to minimum and overheat risk rises sharply; Engineering must redistribute coolant. | engagement |
| A-35 | Jump Drive Recharge Complete | yes (C-04) | Helms, Engineering | Captain, Helms | Jump drive's charge bar refills to 100% after a jump; ship can jump again; Helms reports "jump drive ready, sir." | cruise, engagement |
| A-36 | Warp Disengaged | yes (C-05) | Helms | Captain, Engineering, Relay | Helms moves warp slider to 0 (on arrival, low energy, or by order); FTL travel ends; continuous energy drain stops; Engineering can re-prioritize power; Relay updates sector context. | cruise |
| A-37 | Shield Calibration Complete | yes (C-09) | Weapons | Captain, Helms, Engineering | Shield calibration timer expires; shields re-engage at the new frequency; Weapons announces "shields back up." Symmetric to A-28. | engagement |
| A-38 | Missile Tube Fired | yes (C-19) | Weapons | Captain | A loaded tube fires its missile; tube state becomes empty; Weapons must reload via another C-19 cycle to fire from that tube again. | engagement |

---

## Notes on Uncertainty

- **C-04 activation_delay (~10s)** — Specific delay value is template-dependent; vanilla ship templates set `jump_drive_charge_time` and activation differently. The 10s figure is widely cited but not a single canonical constant.
- **C-09 calibration_time (~25s)** — Vanilla `shield_calibration_delay` default may be closer to 30s on most ship templates. Exact value not confirmed against current source.
- **C-14 hacked_level +0.5 per puzzle** — Likely scenario-configurable; not a documented vanilla constant. The cap (1.0) is the documented invariant.
- **A-04 ~0.08 health-fraction/s overheat damage** — Derived from observation/community measurement, not a documented API constant. Order of magnitude is right.
- **A-07 Low Energy** — The "Low energy" notification is confirmed in vanilla EE ([GitHub issue #42, daid comment](https://github.com/daid/EmptyEpsilon/issues/42): "Now it shows Low energy notification"). The exact threshold value is not in public documentation.
- **A-12 Probe Arrived** — Probes show as moving icons on Relay's sector map and become linkable on arrival. Whether vanilla EE fires an explicit pop-up vs. only a visual cue at the moment of arrival is unclear from docs; the practical effect (Relay calls it out) is unchanged.
- **A-17 ~0.35 heat_per_jump** — Roughly correct but jump-drive templates vary; not a single canonical constant.
- **A-18 Own System Hacked** — The scripting API exposes `setHacked()` and the engine supports player systems being hacked, but vanilla NPC AI does not use the Lights Out / Minesweeper puzzle against the player. In practice, scripted scenarios drive this. Marked `[?]`.
- **A-19 Waypoint Reached** — EE does not appear to fire a mechanical arrival event when a ship reaches a Relay-placed waypoint; the trigger is verbal and observational (Helms notices the waypoint icon overlap). Marked `[?]`.
- **A-25 Contact Lost vs. A-22 Entering Nebula** — When contact loss is caused by a nebula occluding sensors, A-22 is the primary trigger and A-25 does not separately fire. A-25 applies to range-based disappearance; the own-motion case (player jumped or warped away) is anticipated from C-04/C-05.
- **A-25 indicator** — Whether EE displays any explicit "contact lost" indicator vs. just the icon vanishing is not documented. The verbal trigger ("we've lost them") fires in any case.
- **A-21 Repair Complete parent** — Engineering autonomously dispatches repair crew without a Captain command. The anticipated parent is A-05 (System Breakdown triggers the repair dispatch chain: `A-05 → Engineering crew dispatch (internal) → A-21`).

---

## Per-Station Checklist

Listed as outgoing (events the station originates and announces) and incoming (events the station receives or must act on). Anything the Captain "originates" is a command (C-XX); the Captain has no station-originated alerts.

### Captain
**Outgoing (commands):** C-01 through C-25 — all 25.
**Incoming (alerts):** A-01 through A-38 (all). The Captain has no console; every alert flows through other stations' verbal reports to the Captain's mental model. This is a property of the no-console design, not a finding.
**Gap:** none — the consoleless captain absorbs every channel by design.

### Helms
**Outgoing (alerts):** A-07 Low Energy (co-origin), A-17 Jump Complete, A-19 Waypoint Reached `[?]`, A-20 Docked Confirmed, A-30 Energy Depleted (co-origin), A-35 Jump Drive Recharge Complete (co-origin with Engineering), A-36 Warp Disengaged.
**Outgoing (partial):** A-27a–d Navigation Hazards (co-detector with Science when hazards enter short-range radar).
**Incoming (commands):** C-01 Set Heading, C-02 Engage Target, C-04 Initiate Jump, C-05 Engage Warp, C-06 Dock, C-07 Undock, C-23 Set Impulse Speed, C-24 Place Waypoint (waypoint becomes nav target), C-25 Set Alert Level.
**Incoming (alerts requiring Helms reaction):** A-08 Shield Down (rotate ship), A-27a–d Navigation Hazards (course correct), A-03 Deep Scan Complete (auto-receives enemy beam arcs as a screen update — the only mechanical, non-verbal data import in EE), A-30 Energy Depleted, A-35 Jump Drive Ready, A-37 Shield Calibration Complete.
**Gap:** Outbound traffic clusters around jump/warp lifecycle. In long impulse cruises with no waypoints, Helms goes quiet between commands.

### Weapons
**Outgoing (alerts):** A-07 Low Energy (co-origin), A-08 Shield Down, A-09 Missile Type Depleted, A-11 Enemy Destroyed, A-28 Missile Tube Loaded, A-29 EMP Hit (co-origin with Engineering), A-37 Shield Calibration Complete, A-38 Missile Tube Fired.
**Incoming (commands):** C-02 Engage Target, C-03 Hold Fire, C-09 Modulate Shield Frequency, C-10 Retune Beam Frequency, C-18 Deploy Mine, C-19 Load and Fire Missile, C-20 Designate Subsystem Target, C-21 Raise/Lower Shields, C-25 Set Alert Level.
**Incoming (alerts requiring Weapons reaction):** A-03 Deep Scan Complete (verbal frequencies + auto beam-arcs), A-04 Overheat (when beam/shield/missile system overheats), A-05 Breakdown (when a Weapons-owned system breaks), A-21 Repair Complete (when a Weapons-owned system is repaired).
**Gap:** No outgoing alerts for "weapon arc clear." Verbose during combat, quiet otherwise.

### Science
**Outgoing (alerts):** A-01 New Contact, A-02 Simple Scan Complete, A-03 Deep Scan Complete (frequencies — verbal), A-11 Enemy Destroyed (co-origin with Weapons), A-22 Entering Nebula, A-25 Contact Lost, A-27a–d Navigation Hazards, A-33 Friendly Destroyed.
**Incoming (commands):** C-11 Scan Order, C-25 Set Alert Level.
**Incoming (data flow that enables Science):** C-13 Link Probe to Science (Relay extends Science's sensor reach), A-12 Probe Arrived (now usable), A-17 Jump Complete (new sector to scan).
**Gap:** Only one task-driving inbound command (C-11). After full sector scan, outbound traffic dries up (the well-known Science idle problem).

### Engineering
**Outgoing (alerts):** A-04 Overheat, A-05 Breakdown, A-06 Hull Damage, A-07 Low Energy (co-origin), A-18 Own System Hacked, A-21 Repair Complete, A-23 Self-Destruct Countdown, A-29 EMP Hit (co-origin), A-30 Energy Depleted (co-origin), A-32 Self-Destruct Detonation, A-34 Coolant Depleted, A-35 Jump Drive Recharge Complete (co-origin with Helms).
**Incoming (commands):** C-08 Power Priority, C-22 Authorize Self-Destruct, C-25 Set Alert Level.
**Incoming (context required, but no console access — must arrive verbally):** C-02 Engage (so Engineering knows to anticipate weapons heat and shield power), C-04 Initiate Jump (for power-to-jump-drive), C-05 Engage Warp (sustained energy drain), C-21 Raise/Lower Shields (power redistribution).
**Incoming (alerts driving Engineering action):** A-29 EMP Hit (sudden energy drop), A-36 Warp Disengaged (drain ceased — re-prioritize), A-37 Shield Calibration Complete (shield power back online).
**Gap:** Engineering has only 3 inbound *commands* but depends verbally on knowing every command another station receives. This is the signature EE pattern: an inward-only console plus a verbal-context dependency on every other station.

### Relay
**Outgoing (alerts):** A-10 Incoming NPC Hail, A-12 Probe Arrived, A-13 Probe Expired, A-14 Ally Distress, A-15 Sector Contact, A-16 Hack Successful, A-24 Reputation Low, A-25 Contact Lost (co-origin with Science), A-26 NPC Comms Response, A-31 Probe Cap Reached, A-33 Friendly Destroyed (co-origin with Science).
**Outgoing (verbal data):** waypoint distance to Helms (continuously, before each jump) — covered as part of C-04/C-24 coordination, not its own trigger.
**Incoming (commands):** C-12 Launch Probe, C-13 Link Probe, C-14 Initiate Hack, C-15 Hail Target, C-16 Request Reinforcements, C-17 Request Resupply, C-24 Place Waypoint, C-25 Set Alert Level.
**Incoming (alerts that drive Relay action):** A-09 Missile Depleted (resupply consideration), A-20 Docked Confirmed (resupply window opens — C-17), A-22 Entering Nebula (probe placement needed), A-27d Wormhole (sector map must be updated after transit), A-36 Warp Disengaged (sector context update).
**Gap:** Relay is the most workload-bursty station. In an explored, friendly sector with full probe coverage, all outgoing alerts go quiet at once. The hacking minigame (C-14 → A-16) is self-contained and bypasses cross-station comms entirely — a known anti-pattern flagged in [GitHub issue #467](https://github.com/daid/EmptyEpsilon/issues/467).

### Coverage Summary

| Station | Outgoing alerts | Inbound commands | Inbound alerts requiring action |
|---|---|---|---|
| Captain | 0 | n/a | all (universal sink by design) |
| Helms | 7 (incl. co-origin) | 9 | 5 (A-08, A-27a–d, A-30, A-35, A-37) + 1 auto (A-03) |
| Weapons | 8 | 9 | 4 (A-04, A-05, A-21, A-29) + verbal/auto (A-03) |
| Science | 8 | 2 | enabling-data only |
| Engineering | 12 | 3 | 4 verbal-context (C-02/04/05/21) + 3 alert (A-29, A-36, A-37) |
| Relay | 11 | 8 | 5 (A-09, A-20, A-22, A-27d, A-36) |

The asymmetry is deliberate: Engineering and Relay produce most alerts; Captain and Engineering consume most context. Helms and Weapons are command-heavy and alert-thin — they need orders more than they generate news.

---

## Appendix A: Composite Captain Calls (Not Discrete EE Triggers)

These are common captain-level decisions that decompose into multiple discrete commands. They are **not** triggers because they have no single corresponding state change in EE.

| Composite call | Constituent commands |
|---|---|
| Retreat | C-01 (heading) + C-05/C-04 (propulsion) + C-08 (power to engines) + optional C-18 (mines as cover) |
| Combat approach | C-25 (Yellow/Red Alert) + C-21 (shields up) + C-01 + C-02 + C-08 + C-09 |
| Stealth run | C-08 (power down non-essentials) + C-21 (shields down) + C-23 (reduced impulse) |

---

## Appendix B: Missing-from-EE Concepts

Triggers a richer bridge sim could express that vanilla EE does **not** mechanically generate. Each is either absent entirely or implemented only as scenario script.

| Concept | EE status | What's missing |
|---|---|---|
| Alert level → posture coupling | Partial. C-25 sets the alert state but vanilla doesn't auto-raise shields, prime weapons, or change power. | No mechanical coupling between alert level and weapons/shields/power posture. Currently a comms cue only. |
| Hull breach localization | Not in vanilla. Hull is a single global number. | No room-specific breach event despite the ship having a room grid (community workshop scripts exist; not vanilla). |
| Life support, atmosphere, gravity events | None. | No oxygen, decompression, gravity-loss, temperature-of-crew-quarters triggers. |
| Crew morale, fatigue, casualties | None. | Repair crew can die from overheat ("burned alive" line in training video) but no morale system; no captain-mutiny mechanic despite the joke in docs. |
| Fuel separate from energy | None. | EE has only the shared energy pool plus coolant; no consumables-other-than-missiles to track. |
| Cross-station shared text channel | None. | No in-game station-to-station chat; all lateral comms must be voice. |
| Acknowledgement protocol ("Aye, Captain") | Convention only. | No mechanical confirmation of order receipt; orders can be missed silently. |
| Captain's dedicated console | Deliberately absent. | All Captain data flows through other stations' verbal reports. |
| Mission objective list visible to all stations | Scripted only. | No vanilla shared-objectives display; scenario authors push text via comms or main-screen overlays. |
| Sensor ghost / contact intermittency | None. | A contact is either inside radar range or not; no degraded / intermittent / decoy contact states beyond what scripts add. |
| EM noise / sensor jamming as a continuous variable | None (nebula is binary). | Nebulae are radar-blackout zones; no graded interference. |
| Boarding parties and internal combat | Scripted only. | No vanilla mechanic for hostile crew aboard the player ship. |
| Damage-control parties with skills/specializations | None. | Repair crews are interchangeable units; no medic/engineer/security specializations. |
| Acoustic / passive sensor mode | None. | Science's radar is always-on active; there's no passive-listen mode that would generate distinct contact events. |
| Time pressure on dialog (timed comms responses) | None. | NPC comms menus wait indefinitely for Captain decision; no countdown-based dialog tension. |
| Cargo / inventory beyond missiles | None. | No cargo-bay events, supply manifests, or loot. |
| Crew rotation / shift change | None. | No fatigue or mid-mission station-handoff trigger. |
| Hostile lock-on detected | None. | EE does not expose enemy targeting lock on the player ship as a sensor event. |

These gaps are not criticisms — they're a map of design space EE intentionally leaves empty, useful for a TTRPG/LARP designer deciding which dimensions to add and which to leave out.

---

## Sources

- [EmptyEpsilon Official Documentation](https://daid.github.io/EmptyEpsilon/) — primary source for all station mechanics.
- [EmptyEpsilon GitHub Repository](https://github.com/daid/EmptyEpsilon) — source code and developer comments.
- [GitHub Issue #42 — Work on new features for EE](https://github.com/daid/EmptyEpsilon/issues/42) — confirms vanilla "Low energy" notification (A-07).
- [GitHub Issue #467 — Making Hacking less random](https://github.com/daid/EmptyEpsilon/issues/467) — confirms hacking minigame is currently self-contained at Relay.
- [Engineering Console Training (YouTube)](https://www.youtube.com/watch?v=Fxl6LpYIv-M) — confirms self-destruct codes mechanic on Engineering console (C-22).
- [Helms / Weapons / Science / Relay Console Training videos](https://www.youtube.com/watch?v=AndVYvqaXCM) — per-station behavior verification.
- [EmptyEpsilon Scripting Reference (Oznogon mirror)](https://oznogon.com/ee/EE-2017.05.06_script_reference.html) — verifies dock classes, hacked level API, and other named constants.
