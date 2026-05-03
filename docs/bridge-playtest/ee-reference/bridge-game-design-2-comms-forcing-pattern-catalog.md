# Comms-Forcing Pattern Catalog
### Distilled from EmptyEpsilon for TTRPG & LARP Designers

A pattern language for mechanically compelling verbal communication between players. Each pattern names a structural design move, states what it forces players to do, explains why it survives contact with real groups, and notes how it fails. Examples are drawn from EmptyEpsilon ([source dossier](https://daid.github.io/EmptyEpsilon/)), with notes on transfer to tabletop and live-action contexts.

The patterns assume two design priors:

1. **Communication you legislate is fragile; communication you architect is durable.** Telling players to "stay in character" or "report status often" is a wish. Designing so that silence is *mechanically costly* is a structure.
2. **Asymmetry must be enforced physically, not by convention.** If a player can see another player's information by glancing sideways, you have not built an information silo — you have written a polite request.

---

## Core Patterns

### 1. Information Lock
**Mechanic.** The data lives at station A. The action knob lives at station B. There is no way for B to read the data themselves and no way for A to operate the knob.

**Why it works.** Every time the situation changes, the chain must re-execute. The numbers are specific, the moment is specific, and failure is measurable (less damage, slower jump, wrong destination). Players cannot fake compliance.

**Failure mode.** If A's screen is visible to B, the lock collapses into shoulder-surfing.

**EE example.** Science deep-scans an enemy and learns the shield frequency (a number 0–20, displayed as 400–800 THz). Weapons has the frequency dial but not the value. The number must be spoken every encounter. This is EE's strongest single comms mechanic.

**Transfer.** In a LARP, give one role a sealed envelope of cipher keys and another role the lockbox. In a TTRPG, give the navigator the star chart and the helm the throttle — no one player has both.

---

### 2. Asymmetric Readout
**Mechanic.** Two or more stations see the *same object* but with different fields populated. One sees direction, another sees distance. One sees a contact, another sees its identity.

**Why it works.** Both players are looking at the "same" thing, so both are engaged with it, but neither can act unilaterally. Coordination is automatic because a partial picture is useless.

**Failure mode.** If one station's field set is a strict superset of another's, the smaller view becomes redundant.

**EE example.** Relay places a waypoint. Helms, Weapons, and Science see a directional bearing arrow. Only Relay sees the distance number. Jumping to a waypoint is unsafe without that number, so Relay must announce it.

**Transfer.** In LARP, give two players different overlays of the same map (one shows terrain, one shows enemy positions). In TTRPG, the rogue rolls Perception and learns *that* there are guards; the wizard rolls Arcana and learns *which kind*.

---

### 3. Consoleless Coordinator
**Mechanic.** A role with full decision authority but no direct interface to any system. They cannot self-service any data; they can only ask, listen, and order.

**Why it works.** It is structurally impossible for the coordinator to bypass communication. The role's only tools are voice and attention. They become an integrator by necessity, not by discipline.

**Failure mode.** A weak coordinator (passive, distracted) becomes a bottleneck rather than an integrator. Good design needs to support the coordinator with prompts, shared displays, and crew-trained reporting habits.

**EE example.** The Captain has no console. Their only tools are the shared main screen, voice, and a "3-button mouse taped to an armchair" ([official docs](https://daid.github.io/EmptyEpsilon/)). The [Captain Training video](https://www.youtube.com/watch?v=AndVYvqaXCM) explicitly traces how every tactical decision touches every station.

**Transfer.** A LARP commander has only a clipboard and a comms radio. A TTRPG party leader rolls no skills — they make decisions on what reports they hear. The Director in *Microscope* and the Mayor in *Mall Town* operate on this principle.

---

### 4. Scale Differential
**Mechanic.** Roles do not differ by *topic* (combat / navigation / diplomacy) but by *scale of concern* (this second / this hour / this campaign). Each role's information radius is genuinely different.

**Why it works.** Scale is harder to bridge informally than topic. A weapons officer can occasionally guess at navigation, but a tactical officer cannot guess at strategic patterns visible only at sector scale. The differences in scope create durable, non-overlapping roles.

**Failure mode.** If all scales eventually converge on the same threat, the strategic role becomes a delayed redundancy.

**EE example.** Science sees ~25 units. Helms and Weapons see ~5–10 units. Relay sees the entire sector aggregated from all friendly sensors. Three genuinely different time-horizons live on three different stations.

**Transfer.** A LARP intelligence officer reads weekly cables; the field operative reads what's in the room; the analyst reads decade-long trends. A TTRPG party splits into "what's around the corner" (scout), "what's in this dungeon" (player), and "what's in the world" (sage).

---

### 5. Recurrent Numerical Handoff
**Mechanic.** A specific *number* must be transmitted between two roles every time a triggering event occurs. The number is not narrative ("they look dangerous") but precise ("frequency 12, 580 THz").

**Why it works.** Numbers cannot be paraphrased or fudged. They cannot be "implied by context." Saying them aloud is the only way to transmit them, and getting them slightly wrong has measurable consequences.

**Failure mode.** If the number is the same most encounters, players memorize it and stop transmitting. If the number is too granular to remember, players write it down once and never re-check.

**EE example.** Each enemy ship has a randomized shield frequency. Each combat encounter requires a fresh Science→Weapons number transmission. Same shape of message, different value, every time.

**Transfer.** A heist LARP: the safe combination changes per session and only the hacker sees it. A TTRPG mystery: the cipher key rotates by chapter and only the linguist decodes it.

---

### 6. Internal-View Role
**Mechanic.** One role's screen shows *only* the inside of the system being controlled. They have no awareness of the outside world. They are entirely dependent on inbound communication for context.

**Why it works.** This role generates no information unilaterally — they receive demands and must ask for context. Their state is impossible to plan in isolation, which keeps them embedded in the conversation.

**Failure mode.** During calm periods, the internal-view role goes dormant. Without external pressure, there is nothing to optimize.

**EE example.** Engineering has no radar of any kind. The system grid shows power, heat, coolant, damage — but nothing about why those numbers matter right now. Engineers must be told combat priorities, jump intentions, threat severity.

**Transfer.** A LARP medic in a sealed surgery room hears combat through a speaker but sees only the patient. A TTRPG dungeon master role-played by a player who only narrates room contents from a sealed envelope.

---

### 7. Cooperative Action Chain
**Mechanic.** A single common goal — "escape", "dock", "fire missile salvo" — requires sequential micro-actions from three or more roles, each of which depends on the previous. None can act ahead.

**Why it works.** The chain forces a serial conversation: each station must announce completion before the next can act. The serialization itself is the comms protocol.

**Failure mode.** If the chain becomes scripted ("Engineering, power; Helms, jump; done"), it loses tension. The chain must have decision points where roles can disagree on priority.

**EE example.** A jump-drive escape: Relay finds a safe path → Science confirms no nebulae or hostiles → Engineering routes power to drive (and warns about heat) → Weapons drops mines as cover → Helms triggers the jump → Engineering manages overheat afterward. Six stations, one action, each speaking in turn.

**Transfer.** A LARP heist: Lookout, Hacker, Lifter, Driver — each can only act after the previous reports clear. A TTRPG combat ritual that requires three separate skill checks from different characters in a fixed order.

---

### 8. Range-Limited Action by Proxy
**Mechanic.** A role can perform an action, but only when *another role's positioning* is correct. The actor cannot move themselves into position.

**Why it works.** The action role must request a setup from the position role, and must keep requesting as conditions change. The conversation is "are you in range yet?" repeated until success.

**Failure mode.** If the position role can intuit the action role's needs without being told, it becomes silent service.

**EE example.** Hacking requires the target to be within 5U of *any* friendly object. Relay launches the puzzle, but Helms (or an allied ship's positioning) determines whether it's possible. If the target moves out of range, the hacking dialog closes mid-puzzle. Relay must keep asking Helms to maintain proximity.

**Transfer.** In LARP, a sniper can only shoot what the spotter has marked. In TTRPG, a wizard can only counterspell within line of sight that the rogue has scouted.

---

### 9. Forced Report Trigger
**Mechanic.** Mandatory mechanical events that compel a specific role to *announce something* — not because the rules say "be a good sport" but because some downstream mechanic depends on the announcement having happened.

**Why it works.** Removes captain-dependence from the comms floor. Even with a passive coordinator, certain reports happen automatically because they are the players' only path through their own station.

**Failure mode.** EE *does not* implement this well — it is a recommendation drawn from EE's gaps. The closest thing in EE is that Science scans block targeting until complete, which implicitly forces Science to announce results. A more deliberate version would mark messages as "transmitted to Captain" only after a player physically speaks them.

**Transfer.** In LARP, every door opened triggers a contamination check that the engineer must verbally clear. In TTRPG, the GM does not narrate environmental damage until the perceptive character announces what they see.

---

### 10. Per-Role Input Modality
**Mechanic.** Each role's controls are mechanically distinct from each other — different input devices, different mini-games, different physical motions. Roles cannot easily impersonate each other even when curious.

**Why it works.** Players develop social identity around their station because their *body* is doing something different from everyone else's. The mechanical difference becomes an identity boundary.

**Failure mode.** If all roles eventually reduce to the same physical action (clicking buttons), the differentiation is cosmetic and players drift between roles.

**EE example.** Engineering drags sliders and shepherds repair crew on a 2D floor plan. Science aligns four frequency sliders within 0.05 for a 2-second hold. Relay solves Lights Out or Minesweeper puzzles. Helms taps headings on a tactical radar. Each station feels physically different.

**Transfer.** In LARP, give each role a real prop with a different operation: a lockpick set, a rotary phone, a Morse key, a soldering iron. In TTRPG, give each class genuinely different mechanical sub-systems (spell points, momentum dice, card hands).

---

### 11. Live Authority for Narrative
**Mechanic.** A facilitator role with full real-time authority to modify the scenario in response to player choices. Not a fixed script; a responsive director.

**Why it works.** Frees scenario design from needing to anticipate every action. Whatever the players try, the live authority can route the world's response so that it makes their choice meaningful.

**Failure mode.** Authority overuse becomes railroading. The live role must intervene to *enable* player agency, not constrain it.

**EE example.** The Game Master screen shows the entire scenario live and can spawn ships, change orders, alter dialogue mid-mission. EE scenarios assume a competent GM as a load-bearing element.

**Transfer.** TTRPG GM is the canonical instance. LARP "negative space" producers (NPC controllers monitoring a control room) are another. Anything less than live authority should be a *small* scenario.

---

## Anti-Patterns

These are design moves that look like they enable the patterns above but actually undermine them. EE exhibits each.

### A. Auto-Pushed Data
**Symptom.** A successful action automatically updates other players' screens with the result, removing the verbal handoff.

**EE example.** Science deep-scans an enemy → the enemy's beam-firing arcs auto-appear on Helms and Weapons screens. The tactical update was the perfect opportunity to force Science to announce something; the software short-circuits it.

**Avoid by.** Make the result visible only to the originating role. Force them to share verbally to deliver value.

---

### B. Solo Minigame in a Collaborative Game
**Symptom.** A role is occupied by a self-contained puzzle that touches no one else.

**EE example.** The hacking minigame (Lights Out / Minesweeper) is entirely Relay's puzzle to solve alone. EE's [GitHub issue #467](https://github.com/daid/EmptyEpsilon/issues/467) proposes redesigning it so hacking time depends on Science's intel — the developer himself acknowledges the current design is a placeholder. The issue has been open since 2017.

**Avoid by.** Any solo task in a comms game should accept inputs from other roles that change its difficulty, duration, or success rate. If a player can play their station offline, the station is the wrong shape.

---

### C. Station Merging
**Symptom.** Two roles with high inter-dependency are combined "for small groups," internalizing the dependency into one player's head.

**EE example.** Tactical (Helms + Weapons) eliminates the pilot/gunner negotiation about ship facing. Operations (Science + Relay) eliminates the probe-link conversation. Both are concessions for small crews that destroy the comms substrate they were meant to support.

**Avoid by.** Reduce *task volume* per role for small crews, not *role count*. Better: shrink the scenario, lengthen the deliberation time, or design the dependency to require *external* participation (NPC, GM, audience).

---

### D. Convention-Only Information Silos
**Symptom.** Information is "supposed to" stay at one role but is technically visible everywhere.

**EE example.** The ship's global energy level is shown on Helms, Weapons, and Engineering screens. In principle Engineering owns power; in practice anyone can see the danger and act on it without asking. Several EE-realistic playtests degenerate into "shoulder surfing across screens" because there is no physical barrier between stations.

**Avoid by.** Enforce silos *physically* — separate rooms, sealed envelopes, headphones, hidden character sheets, props the other roles cannot touch. Convention is a request; physical separation is a structure.

---

### E. Tutorials That Teach Roles in Isolation
**Symptom.** New players learn each role privately, so the *first time* they encounter the inter-role dependencies is during live play under pressure.

**EE example.** The official tutorials are per-station. The most interesting and load-bearing parts of the design — the dependencies — only become visible during a real session. Many groups bounce on the first session because of this.

**Avoid by.** Run a "comms drill" before any mechanics drill. Walk through a scripted scenario where each role's required handoffs are spotlit. Teach the protocol before the buttons.

---

### F. Flat Workload Across All Stations
**Symptom.** Every role has the same level of engagement at the same time. Combat is busy for all; lulls are quiet for all. No staggered demand.

**EE example.** During calm transit, Engineering, Relay, and Science all go quiet simultaneously. The bridge falls silent because nobody has a reason to speak. The captain becomes responsible for inventing engagement.

**Avoid by.** Stagger demand intentionally. Diplomacy phases keep Relay busy while Weapons rests. Repair phases keep Engineering busy while Science rests. Design demand curves that interlock, not synchronize.

---

## Pattern Selection Matrix

| If your design goal is… | Use these patterns | Watch for these anti-patterns |
|---|---|---|
| Force a specific recurring conversation | Information Lock, Recurrent Numerical Handoff | Auto-Pushed Data |
| Keep one role the integrator/coordinator | Consoleless Coordinator, Internal-View Role | Convention-Only Silos |
| Differentiate roles durably | Scale Differential, Per-Role Input Modality | Station Merging |
| Make a single goal feel collaborative | Cooperative Action Chain, Range-Limited Action by Proxy | Solo Minigame |
| Keep everyone busy when nothing is happening | Forced Report Trigger, staggered demand | Flat Workload |
| Support narrative responsiveness | Live Authority for Narrative | Heavy pre-scripting |

---

## A Minimum Comms-Forcing Stack

For a fresh design, the smallest set of patterns that reliably produces an active comms layer:

1. **One Information Lock** that triggers every encounter (Recurrent Numerical Handoff is the strongest version).
2. **One Consoleless Coordinator** so silence has a structural cost at the top.
3. **One Asymmetric Readout** that creates "are you sure?" loops without the high stakes of the Lock.
4. **One Cooperative Action Chain** for the climactic moments — three or more roles, sequential, each with a decision point.
5. **Per-Role Input Modality** for everyone, so players have somatic identity at their station.
6. **Physical separation** between roles, even if it is just a screen barrier or sealed envelope.

Any one of these alone is fragile. All six together produce a bridge that talks because it cannot do otherwise.

---

*Drawn from the EmptyEpsilon dossiers compiled previously: [Mini-Games & Per-Station Interactions], [Station Roles, Dependencies & Communication]. Primary citations within those documents trace back to the [daid/EmptyEpsilon source](https://github.com/daid/EmptyEpsilon), the [official documentation](https://daid.github.io/EmptyEpsilon/), the [Captain](https://www.youtube.com/watch?v=AndVYvqaXCM), [Relay](https://www.youtube.com/watch?v=pwLJiPuYP94), and [Engineering](https://www.youtube.com/watch?v=Fxl6LpYIv-M) training videos, the [Bridge Command live-experience review](https://mssv.net/2024/07/31/bridge-command/), [Odysseus LARP's EE adaptation notes](https://www.odysseuslarp.com/blog/steering-the-starship-empty-epsilon), and [GitHub issue #467](https://github.com/daid/EmptyEpsilon/issues/467) on the hacking minigame's known limitations.*
