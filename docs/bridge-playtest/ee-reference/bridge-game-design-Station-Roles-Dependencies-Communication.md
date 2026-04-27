# EmptyEpsilon: Roles, Mechanics, Information Asymmetry & Communication Design
## A Research Dossier for TTRPG/LARP Designers

*Compiled from EmptyEpsilon official documentation, GitHub source, community forums, Reddit, and bridge-sim post-mortems. All claims cited inline.*

---

## 1. Station Roster: Full and Merged Variants

### Overview

EmptyEpsilon (EE) is an open-source spaceship bridge simulator first released in 2014 by developer Daid (and co-developer Nallath), built as a direct response to the closed-source *Artemis Spaceship Bridge Simulator*. The [official site](https://daid.github.io/EmptyEpsilon/) describes its design goal plainly: "EmptyEpsilon places you in the roles of a spaceship's bridge officers, like those seen in Star Trek. While you can play EmptyEpsilon alone or with friends, the best experience involves 6 players working together on each ship."

The six canonical roles are: **Captain, Helms, Weapons, Engineering, Science, and Relay.** The Captain is the odd role out — they have no dedicated control console, only command authority.

### The Six Standard Stations

**Helms**
Primary screen: a short-range tactical radar (2D top-down) showing the ship's immediate vicinity. Key readouts in the upper-left corner: current energy (max 1,000), heading in degrees, and current speed in Units/minute. Controls: impulse slider (−100% to +100%), a warp or jump drive slider, and — on capable ships — combat maneuver sliders. The Helms officer sets heading by tapping inside the radar, not via numeric input. If the ship has beam weapons, the radar overlays the firing arcs, giving Helms partial visual awareness of whether a target is in Weapons' sights. Helms also controls docking and undocking.

What Helms *cannot* see: enemy shield or beam frequencies, the long-range sector map, power levels in individual systems, or any comms traffic. The energy readout is a global ship figure, not a per-system breakdown. Jump drive charge time depends on how much power Engineering has routed to the drive — information Helms does not see directly and must receive verbally. [Source: daid.github.io/EmptyEpsilon, Stations tab](https://daid.github.io/EmptyEpsilon/)

**Weapons**
Primary screen: short-range radar (same scale as Helms), target list, weapon tube status panel, missile inventory, beam frequency selectors, and front/rear shield strength readouts. Weapons selects targets on radar, loads missile tubes (time-limited), and fires. Beam weapons auto-fire when a target is in arc. After a deep scan by Science, the Helms and Weapons screens can *both* see the firing arcs of enemy ships — a piece of scan data that crosses stations automatically.

The key cross-station dependency: Weapons can see a target's shield and beam frequency only *after* Science performs a deep scan. The Weapons officer has frequency dials at the bottom right but no source of the target's actual frequency — that number must come verbally from Science. Shield remodulation takes the shields offline briefly, creating tactical timing pressure. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Engineering**
Primary screen: a 2D ship schematic (the system grid) showing every named subsystem as a row in a table. Each row has four columns: health (−100% to +100%), temperature, power level, and coolant. Sliders control power and coolant allocation per system. A central map of the ship shows the physical locations of repair crews and damage zones (highlighted red). Engineering dispatches repair crews by selecting them and tapping the destination room.

What Engineering *cannot* see: where the ship is, what it's fighting, what heading is being held, or what targets Science has scanned. Engineering has no radar. The station is entirely inward-looking. The [official training description](https://www.youtube.com/watch?v=Fxl6LpYIv-M) notes: "many demands are made and it is your responsibility to balance those demands." Critically, Engineering cannot predict what those demands will be without someone telling them. [Source: Engineering Console Training, YouTube](https://www.youtube.com/watch?v=Fxl6LpYIv-M)

**Science**
Primary screen: a long-range radar showing up to 25U radius — the largest sensor footprint of any station. Two scanning minigames: simple scan (align two frequency sliders) identifies faction and ship type; deep scan (align frequency *and* modulation for each scan type) reveals shield frequency, beam frequency, and makes enemy beam arcs visible on Helms and Weapons screens. Science also has a database of all known ship types for reference. A probe-link feature allows Science to scan ships within the sensor radius of a probe launched by Relay, even if those ships are beyond Science's own long-range radar or inside a nebula.

What Science *cannot* do: it cannot launch probes (Relay owns that). It cannot communicate with other ships (Relay owns that). It cannot set waypoints (Relay owns that). It can see ships at long range but cannot distinguish friend from foe until scanned. Nebulae block Science's radar entirely — a significant tactical blind spot that requires Relay's probes to cover. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Relay**
Primary screen: a sector-wide map showing ships within short-range scanner range (5U) plus the short-range sensor data of *all* friendly ships and stations — meaning Relay can sometimes spot enemies that neither Helms nor Science sees yet. Relay cannot scan ships (no scan mechanic), but can launch up to 8 time-limited probes to any sector location. These probes last 10 minutes and can be linked to Science. Relay manages all text-based communications with NPC ships and stations (via a menu-driven comms interface with predetermined responses), sets waypoints that appear on Helms/Weapons/Science radars, and manages the ship's reputation resource (spent on requesting reinforcements or resupply). Relay also owns the hacking minigame (Lights Out/Minesweeper puzzles) to degrade enemy systems.

What Relay *cannot* see: the ship's internal systems, power levels, or repair status. Relay has no combat weapons control. Waypoints placed by Relay appear as directional indicators on other stations' radars but without distance — the [Relay training video](https://www.youtube.com/watch?v=pwLJiPuYP94) explicitly notes "you will need to provide distance data to your crew for example when performing a jump distance is critical if you miscalculate you could die." Distance is a Relay readout that must be verbally transmitted to Helms. [Source: Relay Console Training, YouTube](https://www.youtube.com/watch?v=pwLJiPuYP94)

**Captain**
No console. No controls. The Captain's only tools are: the main screen (a shared display, default showing an external 3D view of the ship), keyboard controls to rotate/zoom the main screen between views (short-range radar, long-range radar, first-person, directional cameras), and their voice. The [official documentation](https://daid.github.io/EmptyEpsilon/) states: "The Captain's only duty is to communicate with the other officers and tell them what they should do." The Captain's tasks listed are: planning next actions, co-ordinating combat tactics, preventing mutiny, and setting priorities.

### Merged/Reduced-Crew Stations

EE includes three official combined stations designed for 3–4 player crews, as documented on the [official site](https://daid.github.io/EmptyEpsilon/):

| Station | Combines | What's Lost |
|---|---|---|
| **Tactical** | Helms + Weapons | The internal negotiation between pilot and gunner disappears; one player handles both |
| **Engineering+** | Engineering + Shield Activation | Shield management moves from Weapons to Engineering; Weapons loses one coordination point |
| **Operations** | Science + Relay (comms) | Science's sensor data and Relay's comms/probes/waypoints merge into one station |

These can be combined with standard stations in any configuration. EE also supports running multiple roles on a single machine via tab-switching — allowing solo or two-player play, though the [official docs](https://daid.github.io/EmptyEpsilon/) note that voice chat is "strongly recommended" for internet play, implicitly acknowledging that the information flow breaks down without it.

### Crew Scaling Summary

| Players | Recommended Configuration |
|---|---|
| 1 | All stations on one machine (tab-switch), effectively a single-player game |
| 2 | Captain + Tactical + Operations, or similar collapsed arrangement |
| 3 | Captain + Tactical + Engineering+ + Operations |
| 4 | Captain + Tactical + Engineering + Operations |
| 5 | Captain + Helms + Weapons + Engineering + Operations |
| 6 | Full: Captain + Helms + Weapons + Engineering + Science + Relay |
| 6+ | Multiple player ships on same server (developer Daid notes a record of [70+ players across 12 ships](https://hackaday.com/2025/03/23/build-a-starship-starship-bridge-simulator-with-emptyepsilon/)) |

---

## 2. Hard Mechanical Dependencies: The "Must Talk" List

The most analytically useful property of EE's design is that several pieces of information exist at exactly one station and are required by another station to perform optimally. These create what game designers sometimes call *forced communication moments* — situations where silence is mechanically costly.

### Dependency Map

**Science → Weapons (Shield Frequency)**
A deep scan by Science yields the enemy's shield frequency and beam frequency. Weapons needs the shield frequency to modulate their beam weapons for maximum damage. This number does not appear on the Weapons screen. Science must read it aloud. Without it, Weapons fires at default frequency — still functional, but less efficient against shielded enemies. This is EE's strongest single comms dependency: the information exists at one station, the action knob exists at another, and optimal play requires bridging them every time a new enemy is encountered. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Relay → Helms (Waypoint Distances)**
Relay sets waypoints that appear as directional arrows on Helms' radar. But Helms sees only the direction, not the distance to the waypoint. For jump drive navigation, distance is safety-critical — too short a jump leaves the ship in combat range, too long a jump overshoots the target. Relay has the distance readout and must transmit it. [Source: Relay Console Training, YouTube](https://www.youtube.com/watch?v=pwLJiPuYP94)

**Engineering → Helms (Power to Engines/Jump Drive)**
Jump drive charge time is a direct function of how much power Engineering has allocated to the drive. A jump with 50% power takes longer to spool than one with 100%+. Helms initiates the jump but does not see Engineering's power allocation; they feel it only as a delayed countdown. If Engineering is running low on energy (the global pool) and has cut power to engines, Helms will notice reduced speed but not why. Coordination is required before any high-energy maneuver: "Engineering, I need full power to jump drive" followed by Engineering confirming availability. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Helms/Weapons → Engineering (Combat Priority)**
Engineering cannot predict from its system grid alone whether the next 30 seconds will require maximum shield power or maximum warp power. Both states are valid but mutually costly (overpowering one system draws energy from the global pool faster). The captain or individual stations must tell Engineering what's coming: "We're about to jump — route power to jump drive"; "They're hitting us hard — more power to shields." Without this, Engineering operates reactively, allocating power based on damage indicators rather than pre-planned tactics. [Source: Engineering Console Training, YouTube](https://www.youtube.com/watch?v=Fxl6LpYIv-M)

**Relay → Science (Probe Placement)**
Science cannot launch probes and cannot see inside nebulae. Relay can launch probes but cannot scan ships within the probe's sensor range. The intended workflow is: Science identifies a nebula blocking their sensors → tells Relay to place a probe inside → Relay launches the probe and links it to Science → Science can now scan ships inside the nebula. This requires coordination in *both* directions: Science must ask, Relay must place and link. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Relay → Helms (Faction/Ally Status)**
Relay manages comms with allied stations and ships, tracking which factions will respond to hails and what the ship's reputation is. Helms has no access to this. Before requesting a docking approach at a station to resupply, the Captain needs to know from Relay whether the station is friendly and what the reputation cost will be. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Science → All (Identification)**
Until Science scans a ship, it appears gray (unknown) on all radars. Helms, Weapons, and the Captain cannot know if a contact is hostile without Science's scan result. This is a global information bottleneck — combat cannot be competently initiated before Science clears the target. In fast scenarios, Science struggling to keep up with new contacts creates pressure on every other station. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

### Summary Table: Information Silos

| Information | Source Station | Needed By | Must Be Verbally Relayed? |
|---|---|---|---|
| Enemy shield frequency | Science (deep scan) | Weapons (beam calibration) | Yes — no automatic transfer |
| Enemy beam frequency | Science (deep scan) | Weapons (own shield calibration) | Yes |
| Waypoint distance | Relay | Helms (jump navigation) | Yes |
| Jump drive charge state | Engineering | Helms (timing) | Yes (felt as latency, not seen) |
| Power allocation by system | Engineering | Captain/Helms/Weapons (planning) | Yes |
| Faction status / reputation | Relay | Captain (strategic decisions) | Yes |
| Ally ship positions (extended) | Relay (sector map) | Captain/Science | Yes |
| Ship identification | Science | All | Yes — scan result not broadcast |
| Probe network status | Relay | Science (to request links) | Yes |
| Enemy firing arcs (post-deep scan) | Science → auto | Helms + Weapons screens | **Auto-shared** — no verbal needed |

The one automatic cross-station data share in EE: a successfully deep-scanned ship's beam firing arcs appear on both Helms and Weapons screens without verbal relay. This is the exception, not the rule.

---

## 3. Information Asymmetry: What Each Station Sees

The following per-station breakdown details what is *visible* versus *hidden*, analyzed for how it structures verbal communication.

### Helms
**Visible:** Short-range radar (immediate vicinity, roughly 5–10U), own ship's heading (degrees), speed, total ship energy (single number), impulse slider position, warp/jump slider, combat maneuver slider states, beam weapon firing arcs (own ship only), enemy beam arcs after Science deep scan, waypoints (direction only, not distance).

**Hidden:** Long-range contacts, enemy shield/beam frequencies, individual system power levels, repair crew locations, comms traffic, faction data, probe positions, nebula contents, exact distances to waypoints.

**Communication pressure:** Helms needs heading orders from the Captain, distance data from Relay before jumps, and combat maneuver coordination with Weapons (tube orientation depends on ship facing). When under fire, Helms cannot see shield strength degrading — that's on Weapons' screen. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

### Weapons
**Visible:** Short-range radar (same range as Helms), target lock indicator, missile tube status and inventory, beam firing arcs (own ship), front and rear shield strength (not individual frequencies of enemy), beam frequency dials, current energy. After Science deep scan: enemy beam arcs on radar.

**Hidden:** Long-range contacts, enemy shield frequency (only has the dial, not the target value without Science), own shield frequency vs. enemy beam frequency interaction, power allocation in Engineering, repair status, probe positions, comms with allied ships.

**Communication pressure:** The shield-frequency dependency is Weapons' most persistent need. Beyond that, Weapons needs Helms to maneuver the ship so that enemy ships enter weapons arcs — especially for directional missile tubes. An [official training note](https://daid.github.io/EmptyEpsilon/) explicitly flags this: "Weapon tubes face a specific direction, and some ships only have tubes on certain sides of a ship, making cooperation with the helms officer's maneuvers especially important." [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

### Science
**Visible:** Long-range radar (25U), all contacts in range (post-scan labeled by faction), scan frequency alignment controls, database of ship types, probe-linked view (when Relay connects a probe), signal interference bands at radar edge hinting at beyond-range objects.

**Hidden:** Own ship's power systems, missile inventory, shield status, comms traffic, waypoints, allied faction detailed status. Science cannot see what's inside nebulae — those are radar blackouts. Science cannot see what Relay's sector map shows (Relay's map aggregates sensor data from friendly stations across the sector, potentially more than Science's own radar). [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Communication pressure:** Science is the most outbound-communicative station — they must report scan results, enemy positions, and nebula blind spots to the Captain, Weapons, and Relay continuously. The official station description says: "The Science officer's most important task is to report the sector's status and any changes within it." This is not a mechanical action — it requires the player to decide what to say. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

### Relay
**Visible:** Sector-wide map with short-range data from all friendly ships and stations (potentially showing enemies the ship's own Science hasn't seen yet), probe positions and remaining duration, comms log and conversation history, reputation score, waypoints placed.

**Hidden:** Own ship internal systems, combat weapons, scan data (Relay cannot scan), ship speed/heading, enemy frequencies. Relay's sector map is the broadest strategic picture in the game, but it is shallow — contacts appear but Relay cannot identify them without Science's scan results. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Communication pressure:** Relay is the only station that knows what allies are saying, where friendly ships are at sector scale, and how much reputation remains. This is high-value strategic intelligence the Captain needs. The relay training video says: "this role is critical for exploring the Galaxy communicate frequently with the science officer to explore the surrounding space and provide waypoints and distances to the Helms officer for travel." Relay is the bridge between the galaxy-scale picture and the ship's navigation. [Source: Relay Console Training, YouTube](https://www.youtube.com/watch?v=pwLJiPuYP94)

### Engineering
**Visible:** System grid (every ship system's health, temperature, power, coolant), repair crew locations on ship schematic, global energy level.

**Hidden:** Literally everything outside the ship. Engineering has no radar of any kind. No contacts, no heading, no speed, no enemy data, no comms. Engineering's screen is a pure internal view. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

**Communication pressure:** Engineering's blindness to external events means it is entirely dependent on incoming communication for context. The [engineering training video](https://www.youtube.com/watch?v=Fxl6LpYIv-M) captures the paradox: "many demands are made and it is your responsibility to balance those demands but there will be times when you simply cannot fulfill all the requests." Engineering cannot prioritize without knowing combat context.

### Captain
**Visible:** The main screen (shared with all players visually — typically showing a 3D external view, or switchable to short-range/long-range radar by the Captain or other stations). The Captain can optionally use a Captain's Map — in Artemis this is more developed; in EE the Captain mostly relies on what's visible on the shared main screen.

**Hidden:** Everything that requires a station interface to see — all of the above. The Captain cannot access Science's scan data directly, cannot see Engineering's power grid, cannot read Relay's sector map, and cannot see Weapons' tube status. Every piece of decision-relevant data must be reported by a crew member. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/); [Wikipedia: Artemis Spaceship Bridge Simulator](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)

**Communication pressure:** The Captain is the maximum-communication position. They receive information from all stations and must synthesize it into decisions, then transmit orders back. The [official Captain Training video](https://www.youtube.com/watch?v=AndVYvqaXCM) describes this as "the captain is to communicate with each station to ensure success" and explicitly traces how a single tactical decision (e.g., escaping via jump drive) requires coordinating Relay (best path), Helms (execute), Engineering (power to drive), and Weapons (lay mines as cover). [Source: Captain Training, YouTube](https://www.youtube.com/watch?v=AndVYvqaXCM)

---

## 4. The Captain's Role: Design Intent, Mechanics, and Failure Modes

### Design Intent: No Console

The Captain's consoleless design is a deliberate structural choice inherited from *Artemis* and refined in EE. The [Wikipedia article on Artemis](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator) describes it: "The captain does not have a dedicated screen and does not have any controls." EE repeats this verbatim. The rationale is explicitly stated: "The Captain relies on their trusty crew to report information and follow orders."

By removing the console, the designers enforce a social role. A Captain with a console could, in theory, check their own radar rather than asking Science. A consoleless Captain *cannot* — they must ask. The design answer to "how do we force the captain to communicate?" is "make it physically impossible for them not to." The [Artemis captain wiki](http://artemiswiki.pbworks.com/w/page/39355747/Captain) puts it elegantly: "In a sense, the bridge crew is playing the game via their stations, while the captain is playing via the bridge crew." [Source: artemiswiki.pbworks.com](http://artemiswiki.pbworks.com/w/page/39355747/Captain)

### What the Captain Actually Does

From the [official EE site](https://daid.github.io/EmptyEpsilon/), the Captain's tasks are:
- Planning next actions
- Co-ordinating combat tactics
- Preventing mutiny (semi-humorously: ensuring crew cohesion and morale)
- Setting priorities

The [Captain Training video](https://www.youtube.com/watch?v=AndVYvqaXCM) elaborates: "your second responsibility is to communicate with each station to ensure success." The video traces through a worked example — using warp/jump drive to escape — and shows it touches every station: Relay and Science for routing, Helms for execution, Engineering for power planning, Weapons for a mine drop as cover. The conclusion: "this single example demonstrates that one decision like this involves every station in the bridge and they need to work together to be successful."

The Captain's value is **integration** — they hold the mental model of the ship's current state, goals, and constraints simultaneously, while each station only holds one slice. [Source: Captain Training, YouTube](https://www.youtube.com/watch?v=AndVYvqaXCM)

### Main Screen Controls

The main screen — usually a projector or large monitor visible to all players — is not exclusively the Captain's. Any station can "push" a view to the main screen. The Captain can keyboard-control it with limited inputs: rotating between views (short-range radar, long-range radar, forward camera, aft camera, etc.). The [official docs note](https://daid.github.io/EmptyEpsilon/): "A 'custom' hardware setup for the Captain could be as simple as taping a 3-button mouse to an armchair." This acknowledges the Captain's physical situation at many events: seated without a laptop, navigating by voice while glancing at the shared screen. [Source: daid.github.io/EmptyEpsilon](https://daid.github.io/EmptyEpsilon/)

### Captain Map / GM View

EE has a Game Master screen (separate from any player role) that shows the full tactical picture of the entire scenario — every ship, hazard, and object, with live controls to modify the scenario. GMs use this to run story events. This is distinct from the Captain's role, which has no equivalent tool in standard play. In the [Bridge Command live experience](https://mssv.net/2024/07/31/bridge-command/) (which runs on a customized EE build), a separate Captain's console was added — but the report's author notes: "the role of captain, as I saw it, was mostly relaying information between stations and making minor snap decisions. The overwhelming amount of visual information on each station... made it impossible for any single person to drive decision-making in the same way one might in a slower or turn-based game." [Source: mssv.net Bridge Command review](https://mssv.net/2024/07/31/bridge-command/)

### Comparison to Artemis SBS

In Artemis, the captain role is nearly identical in structure: no dedicated screen, optional "Captain's Map" (a special view some captains use), and full dependence on crew reporting. The [Artemis wiki](http://artemiswiki.pbworks.com/w/page/39355747/Captain) is more prescriptive about *how* captains should communicate, recommending: calling crew by station name before each order ("{Station}, {Order}"), requiring acknowledgement of orders ("Aye, Captain"), developing named power presets with Engineering, and asking crew for advice explicitly. The practical differences between EE and Artemis captain design are minimal — EE's advantage is a more developed GM screen and the open-source extensibility the [Odysseus LARP used](https://www.odysseuslarp.com/blog/steering-the-starship-empty-epsilon) to add external systems and a sixth custom bridge station. [Source: artemiswiki.pbworks.com](http://artemiswiki.pbworks.com/w/page/39355747/Captain); [odysseuslarp.com](https://www.odysseuslarp.com/blog/steering-the-starship-empty-epsilon)

### Captain Failure Modes

**No captain / weak captain:** Without someone integrating information, stations operate in isolation. Weapons fires at whatever it can see; Helms chases contacts without knowing if they're priority targets; Engineering reacts to damage without anticipating power needs. The result, as the [Artemis wiki](http://artemiswiki.pbworks.com/w/page/39355747/Captain) describes, is that "all of the other officers needs the guidance and control of a single mind" — without it, the crew's effective IQ is the minimum of any individual station, not the sum. A [Reddit discussion](https://www.reddit.com/r/ExpeditionaryForce/comments/174caxg/this_series_has_made_me_a_better_captain_in_empty/) on EE captaining notes: "Your role is to monitor the strategic picture and refrain from barking orders at competent crew members. Instead, you issue commands only to shift or adjust the bridge crew's objectives." [Source: artemiswiki.pbworks.com](http://artemiswiki.pbworks.com/w/page/39355747/Captain); [Reddit r/ExpeditionaryForce](https://www.reddit.com/r/ExpeditionaryForce/comments/174caxg/this_series_has_made_me_a_better_captain_in_empty/)

**Micromanaging captain:** Conversely, the [Captain Training video](https://www.youtube.com/watch?v=AndVYvqaXCM) warns: "avoid micromanagement your simple human brain is inadequate for multifaceted functionality instead rely on your crew to provide status updates and then respond with general direction." Captains who try to tell Helms exactly how to fly or Weapons exactly what to target bypass the stations' expertise and create a bottleneck — all decisions flow through one cognitive load rather than being distributed. [Source: Captain Training, YouTube](https://www.youtube.com/watch?v=AndVYvqaXCM)

**Station-absorbed captain:** When the captain doubles up on a station — a common practice for small crews — they lose the global picture. The [Artemis wiki](http://artemiswiki.pbworks.com/w/page/39355747/Captain) warns: "the role of Captain requires that the player not be too focused on details, and instead be aware of what all of the other players are doing." An Artemis player in a [Reddit thread](https://www.reddit.com/r/Artemis/comments/fglwat/evaluating_which_bridge_sim_to_use/) notes: "Usually in group play we will only run four player ships with captain being also science officer" — a common workaround that partially sacrifices communication.

---

## 5. Known Weaknesses, Criticisms, and "Comms-Bypass" Pitfalls

### The Station Merger Problem: Tactical, Engineering+, Operations

When stations are merged, the *internal negotiation* between those roles disappears. The Tactical screen (Helms + Weapons) is the clearest example: the coordination pressure between Helms needing to face a tube-direction toward the target and Weapons needing the heading to match the tube — that entire category of verbal exchange vanishes. One person now knows both facts and can act unilaterally. The dependency is internalized, not externalized. The same applies to Operations (Science + Relay): Science no longer needs to ask Relay to place probes or link them; one player does both silently.

From the bridge-sim community, a [Reddit evaluator](https://www.reddit.com/r/Artemis/comments/fglwat/evaluating_which_bridge_sim_to_use/) notes that "Science is just okay and Communications was very boring" in small-crew configurations — precisely the situation where merges occur. When one player handles both, the intrinsic interest of the interaction evaporates. [Source: Reddit r/Artemis](https://www.reddit.com/r/Artemis/comments/fglwat/evaluating_which_bridge_sim_to_use/)

### The "All Looking at One Screen" Anti-Pattern

Physical proximity in EE sessions creates a subtle bypass: players at adjacent laptops can read each other's screens. If Science's screen is visible to Weapons, Weapons doesn't need Science to announce the enemy shield frequency — they can just look. The entire Science-to-Weapons communication chain evaporates not because of a design choice but because of physical proximity. The same applies to the main screen: if the main screen shows the short-range radar, Helms can see what the main screen shows rather than relying on their own station's radar view, potentially making the Captain's map view redundant.

A [Hackaday commenter](https://hackaday.com/2025/03/23/build-a-starship-starship-bridge-simulator-with-emptyepsilon/) discussing LARP bridge builds implicitly surfaces this: the value of physical separation between stations — separate rooms, physical barriers — is that it re-enforces the information silo that the software creates. The [Bridge Command experience](https://mssv.net/2024/07/31/bridge-command/) (using EE as its engine) works partly because the ship is a physical set with separate stations. [Source: hackaday.com](https://hackaday.com/2025/03/23/build-a-starship-starship-bridge-simulator-with-emptyepsilon/); [mssv.net](https://mssv.net/2024/07/31/bridge-command/)

### Quiet Stations: The Lull Problem

Three stations in EE are prone to silence during non-combat or mid-game lulls:

**Engineering in calm periods:** Once power allocation is set to a stable "cruise" configuration, Engineering has little to do until damage occurs. The [engineering training](https://www.youtube.com/watch?v=Fxl6LpYIv-M) implicitly acknowledges this: most of the "drama" in Engineering comes from damage and overheating — states that require active combat. In peaceful transit phases, Engineering can sit idle for minutes. The station's inward-looking design means it generates no outbound information during calm, so it both does little and says little.

**Relay in explored sectors:** Once all friendly stations are contacted, all allies have acknowledged orders, and probes are placed, Relay's activity reduces to watching the sector map and waiting for new comms. The [Relay training](https://www.youtube.com/watch?v=pwLJiPuYP94) says "communicate frequently with the science officer" — but in a stable sector, there's limited new data to share. The reputation/ordering system creates some busywork but is mechanically thin.

**Science after full scan:** As a [Reddit commenter](https://www.reddit.com/r/Artemis/comments/fglwat/evaluating_which_bridge_sim_to_use/) observes: "you can have everything scanned when the game is only half done." Once all ships in the sector are deep-scanned, Science's primary duty is complete. Long-range radar monitoring continues, but with no new scan triggers, Science goes quiet. The commenter's practical fix: "have them sit next to weapons" so the physical proximity creates informal coordination — but this is a workaround, not a design solution. [Source: Reddit r/Artemis](https://www.reddit.com/r/Artemis/comments/fglwat/evaluating_which_bridge_sim_to_use/)

### Shared Screens / Shoulder-Surfing

Beyond the lull problem, the [Hacker News community discussion on EE](https://news.ycombinator.com/item?id=28345868) surfaces a design tension: "all the bridge simulators seem to have user interfaces which are both less user friendly and older looking than the actual ship interfaces I used to work on." More critically, a HN commenter from a military simulation background observes: "the roles which end up assigned to players are always somewhat arbitrary and convoluted. As they are so artificial, it's not surprising some people end up with little to do." The software can create information silos, but physical arrangements (a living room with everyone around a table vs. a purpose-built set) largely determine whether those silos hold. [Source: Hacker News](https://news.ycombinator.com/item?id=28345868)

### UI Affordances That Let Stations Bypass Comms

Several EE mechanisms automatically share data without verbal relay, partially undermining the communication design:

1. **Deep scan beam arc auto-share:** After Science deep-scans an enemy, that ship's beam weapon arcs automatically appear on both Helms and Weapons screens. This is a comms-bypass baked into the software — Helms and Weapons receive tactical data from Science without being told. Mechanically convenient; communicatively deflating.

2. **Hacking minigame self-contained:** Relay's hacking mechanic (Lights Out/Minesweeper puzzle) is entirely solo — Relay plays the puzzle unilaterally. The [GitHub issue #467](https://github.com/daid/EmptyEpsilon/issues/467) on EE's tracker proposes making hacking data-dependent on Science scans: "the time it takes for an attack to succeed is determined by the amount of info it is provided. An attack starts with 0 info on the target, and the hacker can put in more info at any time, as she finds it out in the database / from the science officer." This proposed redesign would *reintroduce* a Science-Relay dependency that the current implementation does not require. The issue was raised in 2017; the design has not fundamentally changed. [Source: GitHub Issue #467](https://github.com/daid/EmptyEpsilon/issues/467)

3. **Main screen push:** Any station can push their view to the main screen. This means a Weapons officer can show the Captain their targeting radar, short-circuiting the Captain's need to ask "what do you see?" — potentially reducing one type of verbal handoff.

4. **Energy shown on multiple screens:** Both Helms and Weapons display the ship's global energy level, meaning both stations can see if power is critically low without asking Engineering. This is a mild comms-bypass — Engineering's most urgent information (energy crisis) is actually visible at other stations anyway.

### Minigame Imbalance

A [Hacker News commenter](https://news.ycombinator.com/item?id=28345868) specifically critiques EE's minigame design: "Minigames come up pretty often for EE, with one problem being that they aren't fulfilling when there's less to do and overwhelming when there's more. The only station that has them in EE is the Relay/communications station, which models hacking other ships with puzzle minigames." The scanning mechanic at Science is also a light minigame (slider alignment). These solo puzzles occupy the player mechanically during idle moments but are isolated activities — they generate no communication with other stations. [Source: Hacker News](https://news.ycombinator.com/item?id=28345868)

### Tutorial and Onboarding Criticisms

The [Bridge Command review](https://mssv.net/2024/07/31/bridge-command/) — which explicitly uses EE as its underlying engine — notes that the tutorial "still took over twenty minutes and was easily the least engaging part of the experience, something its creators readily admit. I don't think there are any straightforward fixes here; videos wouldn't be much more engaging, and interactive tutorials would probably take longer." This is partly an EE design issue: the inter-station dependencies are the most valuable thing to learn, but tutorials teach each station in isolation, making the dependencies invisible until live play. [Source: mssv.net](https://mssv.net/2024/07/31/bridge-command/)

### Mission Scripting, Pacing, and Lulls

Combat is far easier to script than diplomacy or exploration. The [Bridge Command review](https://mssv.net/2024/07/31/bridge-command/) observes: "combat is easier to simulate and automate than diplomacy, and its centrality in EmptyEpsilon and other engines meant Bridge Command's combat systems were far more interactive and sophisticated than those for guiding our Marine through the pirate-held base." This is structural: EE's built-in mechanics heavily favor combat as the engagement mode. Non-combat scenarios are possible through scripting but require significant GM intervention. When combat lulls occur in a scenario, there is no equivalent built-in mechanic that keeps all stations equivalently busy. [Source: mssv.net](https://mssv.net/2024/07/31/bridge-command/)

### Information That Is Only Convention vs. Mechanically Siloed

A useful distinction for designers:

**Mechanically siloed** (game would break or suffer without verbal relay):
- Shield/beam frequency: Weapons has no way to know enemy frequency without Science telling them.
- Waypoint distance: Helms has no way to see this number without Relay telling them.
- Power allocation detail: No station except Engineering can see the per-system breakdown.
- Deep nebula contents: No station except Science (via probe link) can see inside.
- Sector-wide ally positions: No station except Relay sees aggregated friendly ship positions across the sector.

**Convention only** (information is available elsewhere, verbal relay is optional):
- Global ship energy: Visible on Helms, Weapons, and Engineering screens.
- Enemy ship positions (short-range): Visible on Helms, Weapons, and Science radars.
- Enemy beam arcs (after deep scan): Automatically pushed to Helms and Weapons.
- Ship type database: Science has it; anyone can look over Science's shoulder.
- Current heading: Visible on Helms; the Captain can infer from main screen radar.

The hard dependencies are fewer than EE's dramatic reputation suggests. Most of the *feeling* of intense communication comes from convention (players decide to report status constantly), good captaining (Captain actively asks for reports), and physical immersion. The genuinely mechanical dependencies — the ones no player can bypass — cluster around Science-to-Weapons frequency sharing, Relay-to-Helms distance data, and Engineering's internal priority information.

---

## 6. Design Takeaways for TTRPG/LARP Designers

### What EE Gets Right

**Hard information locks generate reliable forced communication.** The Science → Weapons frequency dependency is EE's best single mechanic because it recurs every time a new enemy is encountered in combat, the value is numerical (not narrative), the source and destination are clearly different players, and failure to execute it costs something measurable (reduced damage). Any designer seeking to force verbal communication should look for opportunities to create similar *specific, recurrent, numerical* dependencies between roles.

**The consoleless Captain is a structurally sound idea.** By removing the Captain's ability to self-service any information, EE guarantees that the Captain must listen. This is more reliable than telling a Captain "your job is to listen" — the design makes self-sufficiency impossible. For LARP/TTRPG designers, the equivalent is giving the coordinator role *no direct resource access* but *full decision authority*.

**Radar scale differentials create natural division of labor.** Science sees 25U; Helms and Weapons see roughly 5–10U; Relay sees the full sector. These are not arbitrary — they map to strategic vs. tactical vs. operational roles. Each scale of information is genuinely useful and genuinely unavailable at the other scales. Designing information domains around *scale of concern* (immediate, near-term, strategic) is more durable than designing around *topic* (weapons vs. navigation vs. diplomacy), because scale differences are harder to bridge informally.

**Single-player stations with distinct input modes prevent role bleed.** Each station has controls that only make sense for its role: Engineering's repair crew dispatch, Science's scan frequency minigame, Relay's comms menu. When a role's actions are mechanically distinct, players cannot easily drift into another role's territory even if they want to. This creates cleaner social identity around positions.

**The GM screen as a separate mode is underrated.** EE's Game Master screen — a fully real-time editable view of the entire scenario — allows scenarios to be run that no player could fully plan in advance. For TTRPG designers, this is the equivalent of a live GM with full situational authority. It ensures that narrative can be responsive to player choices without being fully pre-scripted.

### What EE Does Poorly

**Station workload is uneven and the valley is predictable.** Engineering in cruise, Relay in explored sectors, and Science after full scan are structural idle zones. EE does not have a mechanic to redistribute workload dynamically when some stations go quiet. A TTRPG/LARP designer should build *demand fluctuation* into the role design — roles should have peaks and valleys, but not all at the same time.

**The merged-station shortcuts kill exactly the communication they were meant to enable.** Tactical (Helm+Weapons) is a concession to small groups, but it eliminates the richest source of verbal exchange in the game — the pilot/gunner negotiation about ship facing. A better small-crew design would keep roles separate but reduce each role's total task load, rather than merging roles and eliminating the dependency.

**Shoulder-surfing collapses information siloes.** The game assumes screen privacy that physical arrangements often don't provide. EE works best with physical barriers or at least careful seating arrangements. For LARP/TTRPG, this is a critical lesson: if players can see each other's information (character sheets, map sections, hidden tokens), the asymmetry design fails regardless of how well it's written. Enforce information physically, not just by convention.

**The hacking mechanic is a solo puzzle when it should be a collaborative one.** The [GitHub issue proposing reform](https://github.com/daid/EmptyEpsilon/issues/467) identified this correctly: hacking's minigame occupies Relay in isolation during potentially idle periods, and linking it to Science's scan data would create a new cross-station dependency. Any solo puzzle embedded in a communication-driven game is a design smell. If a player can complete a task without speaking to anyone, the task is probably the wrong shape.

**Communication quality depends entirely on the Captain — which is both a strength and a fragility.** EE's communication load flows through the Captain as an integrator. A good Captain creates a constantly communicating bridge; a passive or overwhelmed Captain creates a ship of silent isolated stations. The design has no mechanical floor on communication — it only has a mechanical ceiling (you cannot self-service across stations). For resilient TTRPG design, consider adding *mandatory report triggers*: mechanical moments that force a station to communicate even without captain prompting (e.g., whenever a new contact is identified, Science must call it out; whenever shield strength drops below 50%, Weapons must announce it).

**Onboarding teaches stations in isolation, but the game requires understanding dependencies.** New players learn each station privately (tutorial mode), which means the first time they discover that Weapons needs Science's scan data is during live play, under fire. The most important things to teach are the inter-station dependencies, not the per-station controls — but the tutorial structure inverts this priority. For LARP/TTRPG, a pre-game exercise that runs the *communication protocol* before running the *mechanics* is likely more valuable than a role-by-role briefing.

### Summary: Steal vs. Avoid

| Design Element | Recommendation |
|---|---|
| Consoleless coordinator role | **Steal** — structurally forces listening |
| Hard cross-role information locks (frequency to frequency) | **Steal** — recurrent, measurable, unbypassable |
| Radar scale differentiation (local/regional/strategic) | **Steal** — elegantly natural role division |
| Distinct per-role input mechanics | **Steal** — prevents role bleed |
| Real-time GM screen with full editing authority | **Steal** — supports responsive narrative |
| Station merging as small-crew solution | **Avoid** — destroys dependencies it was meant to work around |
| Solo minigames (hacking puzzle) in collaborative game | **Avoid or redesign** — creates isolated islands |
| Convention-only information silos (no physical/structural enforcement) | **Avoid** — requires player discipline that physical proximity undermines |
| Flat workload across all stations simultaneously | **Avoid** — creates structural idle zones; design for out-of-phase peaks |
| Tutorial that teaches stations in isolation | **Avoid** — prioritize teaching the dependencies, not the controls |

---

*Sources used throughout this dossier:*

- [EmptyEpsilon Official Documentation](https://daid.github.io/EmptyEpsilon/) — primary source for all station descriptions and mechanics
- [EmptyEpsilon GitHub Repository](https://github.com/daid/EmptyEpsilon) — README, community, developer comments
- [Captain Training Video (YouTube)](https://www.youtube.com/watch?v=AndVYvqaXCM)
- [Relay Console Training (YouTube)](https://www.youtube.com/watch?v=pwLJiPuYP94)
- [Engineering Console Training (YouTube)](https://www.youtube.com/watch?v=Fxl6LpYIv-M)
- [Artemis: Spaceship Bridge Simulator (Wikipedia)](https://en.wikipedia.org/wiki/Artemis:_Spaceship_Bridge_Simulator)
- [Artemis Captain Wiki](http://artemiswiki.pbworks.com/w/page/39355747/Captain)
- [Reddit r/Artemis — Evaluating which bridge sim to use](https://www.reddit.com/r/Artemis/comments/fglwat/evaluating_which_bridge_sim_to_use/)
- [Reddit r/ExpeditionaryForce — EE captain discussion](https://www.reddit.com/r/ExpeditionaryForce/comments/174caxg/this_series_has_made_me_a_better_captain_in_empty/)
- [Hacker News — EmptyEpsilon community discussion](https://news.ycombinator.com/item?id=28345868)
- [Bridge Command review (mssv.net)](https://mssv.net/2024/07/31/bridge-command/) — live EE-based LARP experience analysis
- [Odysseus LARP — Steering the Starship: Empty Epsilon](https://www.odysseuslarp.com/blog/steering-the-starship-empty-epsilon)
- [Hackaday — Build A Starship Bridge Simulator With EmptyEpsilon](https://hackaday.com/2025/03/23/build-a-starship-starship-bridge-simulator-with-emptyepsilon/)
- [GitHub Issue #467 — Making Hacking a little less random](https://github.com/daid/EmptyEpsilon/issues/467)
- [Thorium Nova — What is a Bridge Simulator?](https://thoriumsim.com/blog/what-is-a-bridge-simulator)
