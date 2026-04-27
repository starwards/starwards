# 4–5 Person Bridge Game Design Guide (EmptyEpsilon-Inspired)

This reference is for a 4–5 person starship bridge game heavily inspired by EmptyEpsilon. It assumes a single bridge crew with the following stations:

- Captain (floating, no hard console)
- Pilot / Helm
- Weapons / Tactical
- Engineering
- Signals (Sensors, Hacking, Comms)

You can run this on top of EmptyEpsilon or a similar bridge sim, using house rules and overlays.

---

## 1. Core Design Goals

1. Make **each station essential** under pressure.
2. Make **information asymmetry load-bearing**: no one sees the full truth.
3. Make a **30–60 minute session** satisfying on its own.
4. Let novices be effective within 5–10 minutes.
5. Give the GM clear tools for pacing, escalation, and rescue.

---

## 2. Roles and Stations

### 2.1 Captain

**Fantasy:** You are the person everyone looks to when things go wrong.

**Tools:** Voice, mission context, big-picture view (maybe a printed briefing or GM whisper channel).

**Core responsibilities**
- Set priorities: objective vs. survival vs. intel.
- Decide doctrine: evade, disable, destroy, rescue.
- Assign focus: tell stations which problem matters now.
- Call commitments: retreat vs. push, spend scarce resources.

**What the Captain does *not* do**
- Micromanage mini-games.
- Touch every control.
- Solve station puzzles directly.

**Captain heuristics**
- "If two stations talk at once, decide who goes first."
- "If we have no picture, ask Signals. If we are dying, ask Engineering. If we are safe, ask Weapons and Pilot what we can risk."

---

### 2.2 Pilot / Helm

**Fantasy:** You dance the ship through impossible spaces.

**Core responsibilities**
- Position for weapon arcs and escape.
- Manage velocity, heading, and collision risk.
- Keep safe standoff distance from hazards.

**Key decisions**
- Risky line vs. safe line.
- Commit to an approach vector (slow, broadside, head-on, retreat).
- Choose terrain advantages (nebula, asteroid field, station cover).

**Information available**
- Ship heading and speed.
- Local map with obstacles.
- Course suggestions from Captain and Signals.

---

### 2.3 Weapons / Tactical

**Fantasy:** You turn opportunities into decisive hits.

**Core responsibilities**
- Select targets and prioritize threats.
- Manage ammo and cooldowns.
- Choose weapon modes (e.g., high damage vs. subsystem disable).

**Key decisions**
- Focus fire vs. threat suppression.
- Use scarce ordnance (torpedoes, nukes).
- Exploit vulnerabilities called out by Signals or discovered in combat.

**Information available**
- Own weapon status.
- Target lock quality.
- Limited feedback about enemy health or exposed subsystems.

**Outputs to others**
- Pressure on key threats ("Interceptor 2 is suppressed").
- Data about target behavior ("Cruiser is reinforcing front shield").

---

### 2.4 Engineering

**Fantasy:** You keep the ship alive when it should be dead.

**Core responsibilities**
- Manage power distribution.
- Handle repairs and fault cascades.
- Decide how hard to push the reactor.

**Key decisions**
- Overpower vs. safe power.
- Quick patch vs. deep repair.
- Which subsystem to sacrifice if you cannot sustain all.

**Information available**
- Subsystem health and fault states.
- Reactor heat and stability.
- Repair progress and risk of further damage.

**Outputs to others**
- Capability forecast ("We can hold shields for 30 seconds").
- Warnings ("If we push engines now we risk a reactor trip").

---

### 2.5 Signals (Sensors, Hacking, Comms)

**Fantasy:** You see patterns and vulnerabilities no one else can.

**Core responsibilities**
- Scan and identify contacts.
- Hack and disrupt enemy systems.
- Manage probes, long-range sensors, and intel channels.

**Key decisions**
- Depth vs. breadth of scans.
- Which subsystem to hack.
- When to risk long channel time under fire.

**Information available**
- Contact identities and confidence levels.
- Partial readings of enemy subsystems and status.
- Comms logs and distress calls.

**Outputs to others**
- Target classification ("Unknown contact is a raider frigate").
- Hack windows ("I can drop their rear shields for 10 seconds").
- Course and threat suggestions to Pilot and Captain.

---

## 3. Station Mini-Games

Each station should have short, meaningful tasks that involve decisions, not just waiting for timers.

### 3.1 Signals Mini-Games

#### 3.1.1 Scan Puzzle

Goal: classify a contact and discover one useful property.

Example patterns:
- **Frequency tuning:** Rotate dials to align peaks with template bands.
- **Signal isolation:** Turn off noise sources to reveal a clean waveform.
- **Triangulation:** Adjust three parameters until a confidence meter peaks.

Make different target types map to different puzzles:
- Civilian: easy match, minimal noise, hard to misread.
- Raider: spoofed ID, requires extra step to verify.
- Cloaked: intermittent readings, requires timed clicks or careful patience.

Reward: on success, reveal one of:
- Ship class and approximate firepower.
- A weak shield facing.
- Evidence that contact is non-hostile.

#### 3.1.2 Hack Puzzle

Goal: create a temporary enemy vulnerability.

Example patterns:
- **Node linking:** Connect symbols in a pattern before time runs out.
- **Code match:** Choose the right sequence based on hints from the scan.
- **Channel stability:** Keep a moving indicator inside a safe zone while progress accumulates.

Effects:
- Shield spike: lower one shield facing for N seconds.
- Weapon glitch: delay their next volley.
- Sensor blind: reduce their detection range.

Risk knobs:
- Short, safe hack: small effect, low backlash.
- Deep, risky hack: big effect, but can trigger counter-hack or feedback damage.

### 3.2 Engineering Mini-Games

#### 3.2.1 Repair Board

Represent each subsystem as a node on a small network. Damage creates faults that spread if not contained.

Mechanics:
- Isolate: flip breakers to wall off damaged nodes.
- Reroute: draw new connections to bypass broken links.
- Stabilize: complete a quick pattern or alignment to finish the repair.

Damage types change the repair feel:
- Physical: multiple adjacent nodes fail.
- EMP: node labels are hidden or scrambled.
- Overheat: repair time is short, but failure spikes reactor heat.

#### 3.2.2 Power Push

Mechanics:
- Sliders or dials for main subsystems (engines, weapons, shields, sensors).
- Reactor bar with safe, warning, and critical zones.
- Overcharge adds performance but generates heat faster.

Choices:
- Push one system into overcharge at a time.
- Choose between guaranteed safe power and risky boosts.

Feedback:
- Visual and audio cues for approaching meltdown.
- Captain reports for how long overcharge can be sustained.

### 3.3 Weapons Mini-Games

#### 3.3.1 Firing Solutions

Mechanics:
- Lead indicator that depends on enemy velocity.
- Narrow alignment window for precision shots, wide window for suppression.

Choices:
- Precision shot: difficult alignment, high damage or subsystem hit.
- Suppression: easier to land, forces enemy to maneuver defensively.

Ammo types:
- Standard: plentiful, moderate damage.
- Disruptor: fewer rounds, better at hitting subsystems.
- Finisher: very limited, ideal for final blows or critical objectives.

#### 3.3.2 Target Priority

Threat categories:
- Interceptors: high damage, low durability.
- Cruisers: heavy damage, slow, protect others.
- Support ships: jammers, repair ships, carriers.

Weapons chooses:
- Kill order ("Kill support first" vs. "Clear interceptors")
- When to commit scarce ordnance.

### 3.4 Pilot Mini-Games

Mechanics:
- **Safe path:** steer through corridors between hazards.
- **Facing arcs:** maintain enemy in a favorable firing arc.
- **Burn vs. coast:** choose when to accelerate or drift to save power.

Tasks:
- Escort pathing: keep friendly in a safe bubble.
- Approach pattern: choose vector based on Signals intel.
- Emergency dodge: quick reactions when unexpected threats appear.

---

## 4. Onboarding and First 5–10 Minutes

### 4.1 Session Setup

Before players sit down:
- GM sets up mission in the sim.
- Each console is labeled with role and 2–3 verbs (e.g., WEAPONS: AIM, FIRE, CHOOSE).
- Provide a 1-page cheatsheet per role.

### 4.2 Role Briefing Script (2–3 Minutes)

- Captain: "You make final decisions. When in doubt, say what matters most now."
- Pilot: "You fly the ship. Keep us near objectives and away from bad things."
- Weapons: "You point the guns. Ask Signals and Captain who to shoot."
- Engineering: "You keep us alive. If something breaks, decide what we can live without."
- Signals: "You tell us what is out there and when we can hurt them."

Keep explanations to 1–2 sentences each. Save deep rules for later.

### 4.3 First Mission Beat (Tutorial)

Objective: **Rendezvous with a friendly buoy in a quiet sector.**

Steps:
1. Pilot: steer to a glowing waypoint.
2. Signals: perform a simple scan mini-game on the buoy.
3. Engineering: route power once based on Captain request.
4. Weapons: perform one "test" shot on a target drone, under Captain order.

This gives everyone one clear success in the first few minutes.

### 4.4 Gradual Complexity Ramp

- First encounter: one enemy ship, basic AI.
- Second encounter: two enemies, different archetypes.
- Mid-mission twist: an environmental hazard or surprise damage event.

Introduce new mechanics only when they become relevant.

---

## 5. GM Role and Tools

### 5.1 GM Responsibilities

- Configure and launch missions.
- Control difficulty and pacing.
- Play "the universe" via comms, anomalies, and NPC orders.

### 5.2 GM Controls

- Spawn and despawn ships.
- Modify enemy AI aggression.
- Trigger events: distress calls, anomalies, power failures.

### 5.3 Pacing Framework (30–60 Minutes)

Use a simple three-act structure:

1. **Act 1 – Introduction (0–10 min)**
   - Simple navigation and a non-lethal interaction.
   - One small combat or tension moment.

2. **Act 2 – Escalation (10–35 min)**
   - Overlapping problems: damage + enemies + objectives.
   - Hard choices: cannot do everything at once.

3. **Act 3 – Crisis and Resolution (35–60 min)**
   - Final confrontation.
   - Clear, binary choice for Captain.
   - Epilogue based on success or failure.

### 5.4 Difficulty Dials

- **Enemy count:** Start with 1; rarely exceed 3–4 on screen for novices.
- **Enemy behavior:** Aggression, focus fire, use of abilities.
- **Resource tightness:** Missiles, power margin, repair time.
- **Information clarity:** More or fewer clear hints.

### 5.5 Rescue Tools

If crew is overwhelmed:
- Spawn friendly support.
- Reduce enemy accuracy or aggression.
- Trigger a "lucky break" event (enemy malfunction, sudden intel).

If crew is steamrolling:
- Add a surprise objective.
- Introduce a new enemy type.
- Impose a time limit.

---

## 6. Maps and Scenarios

### 6.1 Map Components

- **Safe zones:** stations, friendly fleets, clear space.
- **Hazards:** asteroid fields, nebulae, minefields.
- **Chokepoints:** narrow passages.
- **Signal anomalies:** artifacts, stealth zones, comms blackouts.

### 6.2 Scenario Templates

1. **Escort**
   - Protect a convoy through dangerous territory.
   - GM dials: wave count, hazard density.

2. **Rescue**
   - Reach and evacuate a damaged ship or station.
   - GM dials: time limit, surprise enemies.

3. **Investigation**
   - Explore an anomaly or derelict.
   - GM dials: number of clues, ambush points.

4. **Heist / Raid**
   - Steal or sabotage a valuable target.
   - GM dials: stealth vs. loud approach, alarm triggers.

5. **Boss Showdown**
   - Fight a powerful flagship or base.
   - GM dials: adds, weak points, multi-phase behavior.

### 6.3 Example 45-Minute Mission

- Map: nebula with two clear lanes and an asteroid pocket.
- Objective: extract data from a science buoy and escape.
- Beats:
  1. Approach and scan buoy.
  2. Raiders arrive mid-scan.
  3. Captain chooses: hold for full data or cut short.
  4. Escape route complicates with hazards or reinforcements.

---

## 7. Information Asymmetry and Captain Play

### 7.1 Asymmetry Model

- Signals knows *what* things are, but not tactical urgency.
- Weapons knows *how hard* enemies can hit or be hit.
- Engineering knows *how close* the ship is to failure.
- Pilot knows *what is physically possible* in time.
- Captain knows *what matters* to the mission and who will care about which risk.

### 7.2 Captain Decision Types

- Priority calls: which objective gets focus.
- Risk appetite: play safe vs. push harder.
- Commitment: when to spend consumables.
- Retreat: when to cut losses.

### 7.3 Feedback for the Captain

GM tools to signal performance:
- NPC comms: praise, concern, or panic.
- Visual cues: objective bars, civilian ships damaged.
- Post-mission debrief: short review of key choices.

---

## 8. Running Novice Sessions

### 8.1 Safety and Comfort

- Encourage players to say "I am lost" or "I need help".
- Rotate roles between missions.
- Avoid punishing mistakes too harshly.

### 8.2 Teaching Style

- Show, then let them do.
- Correct only the most harmful misunderstanding in the moment.
- Save deeper optimization advice for after the mission.

### 8.3 Debrief

After each session, ask:
- Captain: "What was the hardest decision?"
- Stations: "When did you feel most useful? Most lost?"
- Group: "What should we change about roles or difficulty next time?"

Adjust mini-games, difficulty, and information flow based on their answers.

---

## 9. Extending the System

Once the base game feels solid, consider optional modules:

- Additional stations (Science, Comms, Tactical Planning).
- Asymmetric scenarios (two ships, PvP crew vs. crew).
- Campaign mode with persistent damage or politics.
- Personal goals or secret agendas for advanced play.

Start simple, play a lot, and let the best ideas emerge from the table.