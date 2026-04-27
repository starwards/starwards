# EmptyEpsilon Bridge Dynamics — Table Format (5-Role Layout)

5-role config matching the SW baseline: **Helms** (=SW Pilot), **Weapons**,
**Engineering**, **Operations** (Science+Relay merged, =SW Signals), **Captain** (consoleless).

All mechanics from EE source code and verified research dossier.

Same semantics as the Starwards table:
**⚙** = controls · **👁** = sees · **—** = blind · **🗣** = must be verbal · **⚠️** = weakened by Ops merge

## Station Name Mapping

| EE role | SW equivalent | Notes |
|---------|-------------|-------|
| Helms | Pilot | Ship movement, heading, warp/jump |
| Weapons | Weapons | Targeting, beams, missiles, shields, frequency dials |
| Engineering | Engineering | Power, coolant, heat, repair crew |
| Operations | Signals | Science+Relay merged: scanning, hacking, probes, comms, sector map |
| Captain | Captain | Consoleless coordinator |

## Flag Column Key

| Flag | Values |
|------|--------|
| **Phase** | `cruise` · `combat` · `both` |
| **Flow** | `resource` · `info` · `action` · `output` |
| **Pattern** | Comms-forcing pattern demonstrated (if any) |
| **Status** | `✅` working · `⚠️` weakened by Ops merge · `🔇` anti-pattern |

---

## EE 5-Role Bridge

| Domain | Phase | Flow | Pattern | Status | Helms | Weapons | Engineering | Operations | Captain |
|--------|-------|------|---------|--------|-------|---------|-------------|------------|---------|
| **Short-range radar (~5U)** | both | info | Scale Differential | ✅ | 👁 heading + contacts | 👁 short-range + target list | — no radar at all | 👁 has short-range too (via Science half) | 👁 main screen (switchable) |
| **Long-range radar (~25U)** | both | info | Scale Differential | ✅ | — blind beyond ~5U | — blind beyond ~5U | — blind | 👁 primary advantage, earliest detection | — asks Ops 🗣 |
| **Sector-wide map** | both | info | Scale Differential | ✅ | — blind | — blind | — blind | 👁 aggregates all friendly sensors (Relay half) | — asks Ops 🗣 |
| **Radar signature bands** | cruise | info | — | ✅ | — | — | — | 👁 colored bands at radar rim hint at beyond-range contacts | — |
| **Nebula blindness** | both | info | — | ✅ | 👁 short-range unaffected unless inside | 👁 same as Helms | — | 👁 long-range blocked by nebulae; needs probes to see through | — |
| **Contact identification** | both | info | Info Lock | ✅ | 👁 gray (unknown) until Ops scans | 👁 gray (unknown) until Ops scans | — blind | ⚙ simple scan reveals faction + type → auto-colors all radars | — asks Ops 🗣 |
| **Simple scan** | both | action | Per-Role Input | ✅ | — | — | — | ⚙ slider mini-game: align 1–3 sliders within 0.05, hold 2s | — |
| **Simple scan result** | both | info | — | 🔇 | 👁 auto: radar blips color-coded (comms bypass) | 👁 auto: radar blips color-coded (comms bypass) | — | 👁 faction + ship type + database entry | — sees main screen |
| **Deep scan** | combat | action | Per-Role Input | ✅ | — | — | — | ⚙ slider mini-game again (fewer sliders than simple) | — |
| **Enemy shield frequency** | combat | info | Recurrent Numerical Handoff | ✅ | — blind | — blind, has dial but not the number 🗣 | — | 👁 frequency graph (21 bars, 400–800 THz). 🔒 INFO LOCK | — |
| **Enemy beam frequency** | combat | info | Recurrent Numerical Handoff | ✅ | — blind | — blind, has dial but not the number 🗣 | — | 👁 frequency graph. 🔒 INFO LOCK | — |
| **Enemy system health** | combat | info | Info Lock | ✅ | — blind | — blind | — | 👁 per-subsystem health after deep scan | — asks Ops 🗣 |
| **Enemy beam arcs** | combat | info | — | 🔇 | 👁 auto-appear after deep scan (comms bypass) | 👁 auto-appear after deep scan (comms bypass) | — | 👁 visible on own screen too | — sees main screen |
| **Ship database** | both | info | — | ✅ | — | — | — | 👁 reference for all ship classes and capabilities | — |
| **Beam frequency dial** | combat | action | Recurrent Numerical Handoff | ✅ | — | ⚙ sets own beam freq (instant, no downtime) | — | — has the number, not the dial 🗣 | — |
| **Shield frequency dial** | combat | action | Recurrent Numerical Handoff | ✅ | — | ⚙ sets own shield freq (25s offline during change) | — | — has the number, not the dial 🗣 | 🗣 approves timing |
| **Ship heading** | both | action | — | ✅ | ⚙ tap inside radar to set bearing | 👁 visible on own radar | — blind | 👁 visible on own radar | — sees main screen |
| **Impulse speed** | both | action | — | ✅ | ⚙ slider −100% to +100% | — | — | — | 🗣 orders Helms |
| **Warp drive** | cruise | action | Coop Action Chain | ✅ | ⚙ engages warp | — | 👁 sees power allocation to warp | — | 🗣 orders sequence |
| **Jump drive** | cruise | action | Coop Action Chain | ✅ | ⚙ triggers jump (needs distance from Ops) | — | ⚙ power allocation affects charge time 🗣 | 👁 provides safe destination + distance 🗣 | 🗣 coordinates all three |
| **Jump distance** | cruise | info | Info Lock | ✅ | — blind to waypoint distance 🗣 | — | — | 👁 only Ops sees distance on sector map. 🔒 INFO LOCK | 🗣 routes Ops→Helms |
| **Combat maneuver** | combat | action | — | ✅ | ⚙ boost/strafe | — sees on radar | — | — | 🗣 orders Helms |
| **Docking** | cruise | action | — | ✅ | ⚙ initiates dock/undock | — | — | 👁 knows which stations are friendly (Relay half) 🗣 | — |
| **Beam weapons** | combat | action | Coop Action Chain | ✅ | — (but must keep target in arc for Weapons) | ⚙ auto-fire when target in arc | — | — | — |
| **Helms↔Weapons arc negotiation** | combat | info | Asymmetric Readout | ✅ | 👁 sees heading + firing arcs; ⚙ controls heading | 👁 sees target + arcs; needs heading from Helms | — | — | 🗣 mediates if needed |
| **Missile tubes** | combat | action | Per-Role Input | ✅ | — | ⚙ load, select type, fire (tube direction matters for heading) | — | — | 🗣 authorizes scarce ordnance |
| **Target selection** | combat | action | — | ✅ | — (but must point at target for Weapons) | ⚙ selects on short-range radar | — | 👁 can see contacts on long-range but cannot target for Weapons | 🗣 tells Weapons who |
| **Shield activation** | combat | action | — | ✅ | — | ⚙ front/rear shield toggles | — | — | — |
| **Hacking: target selection** | combat | action | Range-Limited by Proxy | ✅ | — (but must keep ship within 5U of target) | — | — | ⚙ selects target + subsystem on map | — |
| **Hacking: mini-game** | combat | action | Solo Minigame ⚠️ | 🔇 | — | — | — | ⚙ Lights Out 7×7 or Minesweeper 10×10 (self-contained, no cross-station input) | — |
| **Hacking: range maintenance** | combat | action | Range-Limited by Proxy | ✅ | must maintain proximity 🗣 (dialog closes if >5U) | — | — | 🗣 asks Helms to hold position | — |
| **Hack effect** | combat | info | — | ✅ | — | 👁 enemy system degraded | 👁 enemy may need repair crew for unhack | 👁 +0.5 hacked_level per success (2 hacks = target at 25% power) | — |
| **Hack recovery (own ship)** | combat | resource | — | ✅ | — | — | ⚙ dispatch crew to unhack (+0.007/sec, ~143s) | — | — |
| **Probes: launch** | both | action | — | ⚠️ | — | — | — | ⚙ launch up to 8 probes, 10-min lifetime, 5U radius (merged: no Relay→Science conversation) | — |
| **Probes: link to scan view** | both | action | — | ⚠️ | — | — | — | ⚙ self-links (merged: was Relay→Science handoff, now silent) | — |
| **Waypoints** | cruise | action | Asymmetric Readout | ✅ | 👁 bearing arrow only, no distance 🗣 | 👁 bearing arrow only | — | ⚙ places waypoints, 👁 sees distance. 🔒 | 🗣 routes distance Ops→Helms |
| **Comms with NPCs** | both | action | — | ⚠️ | — | — | — | ⚙ text menu, reputation cost, ally orders (merged: no Relay→Captain filter) | 🗣 directs Ops what to say |
| **Reputation resource** | both | resource | — | ✅ | — | — | — | 👁 tracks, spends on station requests | — asks Ops 🗣 |
| **Alert level** | both | action | — | ✅ | 👁 color overlay | 👁 color overlay | 👁 color overlay | ⚙ changes alert level | 👁 color overlay |
| **Per-system power** | both | resource | Internal-View | ✅ | — blind to per-system breakdown | — blind to per-system breakdown | ⚙ sliders 0–300% per system (9 systems) | — | — asks Eng 🗣 |
| **Per-system coolant** | both | resource | Internal-View | ✅ | — blind | — blind | ⚙ sliders, total pool = 10, zero-sum | — blind | — |
| **Per-system heat** | combat | resource | Internal-View | ✅ | — blind | — blind | 👁 heat bars + trend arrows, warning at >0.9 | — blind | — asks Eng 🗣 |
| **Heat formula** | combat | resource | — | ✅ | — | — | 👁 delta = 1.7^(power−1) − (1.01 + coolant×0.1) | — | — |
| **Overheat → damage** | combat | resource | — | ✅ | suffers (degraded engines) | suffers (degraded beams/shields) | 👁 0.08 health/sec at sustained overheat | suffers (degraded scan) | — asks Eng 🗣 |
| **System health** | both | info | Internal-View | ✅ | — blind | — blind | 👁 −1.0 to +1.0 per system (negative = inoperable) | — blind | — asks Eng 🗣 |
| **System effectiveness** | both | resource | — | ✅ | feels it (speed, turn rate) | feels it (beam damage, shield regen) | 👁 effectiveness = max(0, power − hacked×0.75) × health | feels it (scan quality) | — |
| **Repair crew dispatch** | combat | action | Per-Role Input | ✅ | — | — | ⚙ click crew → click room, pathfinds through doors, +0.007 health/sec | — | — |
| **Repair time** | combat | info | — | ✅ | — | — | 👁 ~143s full repair per crew member (stacks) | — | — asks Eng 🗣 |
| **Energy pool** | both | resource | — | 🔇 | 👁 top-left HUD (comms bypass) | 👁 top-left HUD (comms bypass) | 👁 on system grid | 👁 (comms bypass — visible at 4 stations) | 👁 main screen |
| **Shield strength** | combat | info | — | 🔇 | — | 👁 front/rear on HUD (comms bypass) | — | — | 👁 main screen |
| **Self-destruct** | combat | action | Coop Action Chain | ✅ | — | — | ⚙ button + confirmation codes | — | 🗣 must authorize (code sharing is verbal) |
| **Main screen view** | both | info | — | ✅ | can push view | can push view | — | can push view | ⚙ rotates between views |
| **Supplies to others** | both | output | — | varies | position + heading (implicit); arc negotiation with Weapons 🗣 | target status; needs Helms for arcs 🗣; needs Ops for freq 🗣 | power, coolant to all; repair + unhack; capability forecast 🗣 | scan intel, freq numbers, waypoints, hack effects, sector picture, comms; ⚠️ merged away Science↔Relay coordination | orders, priority, orchestration |

---

## What the 5-Role Layout Restores (vs 4-Station Tactical Merge)

| Domain | In 4-station (Tactical) | In 5-role (Helms + Weapons) |
|--------|------------------------|---------------------------|
| **Arc negotiation** | One player handles both heading and firing — no negotiation needed | Helms controls heading, Weapons needs target in arc → verbal coordination required every engagement |
| **Combat maneuver** | One player decides both dodge and fire timing | Helms executes maneuver, Weapons must brace for arc disruption |
| **Beam weapons** | Auto-fire + heading = one player's flow | Helms must hold heading for Weapons' auto-fire to connect |
| **Missile tubes** | Tube direction + heading = one player | Weapons calls "tubes face aft" → Helms adjusts heading |
| **Target selection** | One player selects and engages | Weapons selects target, Helms must point at it |
| **Shield frequency** | One player bears the 25s offline risk alone | Weapons changes freq, Helms must compensate for 25s shield gap |

These 6 restored dependencies add **~6 directed edges** to the dependency graph
and create the **Helms↔Weapons arc negotiation** — EE's richest verbal exchange
in the 6-station layout.

---

## Pattern Inventory

| Pattern | Rows demonstrating it | Strength | Notes |
|---------|----------------------|----------|-------|
| **Info Lock** | enemy shield freq, enemy beam freq, jump distance, enemy system health, contact identification | ✅ strong | Shield/beam freq = EE's best mechanic. Fresh number per enemy, every encounter. |
| **Recurrent Numerical Handoff** | enemy shield freq, enemy beam freq, beam dial, shield dial | ✅ strong | Randomized per enemy ship. Cannot memorize. Must speak every engagement. |
| **Asymmetric Readout** | waypoints (bearing vs distance), Helms↔Weapons arc negotiation | ✅ strong | Distance is safety-critical for jump; heading+arcs split between Helms and Weapons. |
| **Consoleless Coordinator** | (Captain column throughout) | ✅ strong | Every "— asks X 🗣" cell is evidence. Only tools: main screen + voice. |
| **Internal-View Role** | power, coolant, heat, system health | ✅ strong | Eng has no radar, no contacts, no heading. Entirely inbound-dependent. |
| **Scale Differential** | short-range, long-range, sector map | ✅ strong | Three genuine scales: 5U / 25U / full sector. |
| **Per-Role Input Modality** | simple scan, deep scan, hack puzzle, repair crew, missile tubes, impulse, heading tap, frequency dials | ✅ strong | Each station physically distinct. |
| **Cooperative Action Chain** | jump drive (4 stations), beam engagement (Helms+Weapons+Ops), self-destruct | ✅ strong | Jump touches Ops→Eng→Helms→Eng. Beam engagement touches Ops→Weapons+Helms. |
| **Range-Limited by Proxy** | hacking target selection, hacking range maintenance | ✅ strong | Ops must ask Helms to hold position; puzzle closes if target exits 5U. |
| **Live Authority** | (GM screen, not in table) | ✅ strong | Full real-time scenario editing. |
| **Solo Minigame** ⚠️ | hacking mini-game | 🔇 anti-pattern | Lights Out / Minesweeper: self-contained, no cross-station input. Developer acknowledges as placeholder (#467). |
| **Auto-Pushed Data** ⚠️ | simple scan result, enemy beam arcs, energy pool, shield strength | 🔇 anti-pattern | Data crosses stations without verbal handoff. |
| **Flat Workload** ⚠️ | (not a single row — structural) | 🔇 anti-pattern | Eng idle in cruise, Ops idle after scans complete. |
| **Station Merge losses** ⚠️ | probes, probe link, comms | ⚠️ weakened | Science↔Relay probe coordination eliminated. Helms↔Weapons is RESTORED in this layout. |

---

## Row Grouping Quick Reference

**By Phase:**
- `cruise` (8): warp, jump, jump distance, docking, waypoints, comms, probes, radar signatures
- `combat` (22): scans, frequencies, arcs, beams, missiles, shields, hacking (5 rows), heat, damage, repair, self-destruct, arc negotiation, combat maneuver
- `both` (24): radars, contacts, identification, heading, power, coolant, status, health, effectiveness, energy, alert, main screen, supplies

**By Pattern:**
- Info Lock (5 rows): all frequency handoffs + jump distance + contact ID + enemy health
- Recurrent Numerical Handoff (4 rows): per-encounter frequency exchange
- Asymmetric Readout (2 rows): waypoints + Helms↔Weapons arcs
- Internal-View (4 rows): Eng's blindness to everything external
- Scale Differential (3 rows): three radar ranges
- Coop Action Chain (3 rows): jump + beam engagement + self-destruct
- ⚠️ Ops merge losses (3 rows): probe coordination internalized
- 🔇 Anti-patterns (5 rows): auto-pushed data + solo minigame
