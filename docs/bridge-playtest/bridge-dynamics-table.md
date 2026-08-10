# Bridge Dynamics — Table Format

Columns = station/role. Flag columns = row metadata for grouping/filtering.
Each cell = what that station **controls** (⚙), **sees** (👁), or is **blind to** (—).
🗣 = must be verbal. ⬜ = not yet built. ❌ = design gap.

## Flag Column Key

| Flag | Values |
|------|--------|
| **Phase** | `cruise` = always relevant · `combat` = under fire · `both` |
| **Flow** | `resource` = energy/heat/coolant · `info` = data asymmetry · `action` = player does something · `output` = what station supplies to others |
| **Pattern** | Which comms-forcing pattern this row demonstrates (if any) |
| **Status** | `✅` built · `🟡` partial · `⬜` not built · `❌` gap |

---

## Starwards: 4 Stations + Captain

| Domain | Phase | Flow | Pattern | Status | Pilot | Weapons | Engineer | Signals | Captain |
|--------|-------|------|---------|--------|-------|---------|------------|---------|---------|
| **Radar range** | both | info | Scale Differential | ✅ | 👁 pilot radar | 👁 tactical, 5km | — no radar | 👁 long-range, 50–250km | — no screen |
| **Contact detection** | both | info | Scale Differential | ✅ | 👁 blips gated by scan level | 👁 blips gated by scan level | — blind | 👁 earliest detection, widest view | — asks Signals 🗣 |
| **Scan levels** | both | info | Info Lock | 🟡 | 👁 consumes (gates blips) | 👁 consumes (gates blips) | — blind | ⬜ would initiate (GM-controlled today) | — asks Signals 🗣 |
| **Target selection** | combat | action | — | ✅ | — | ⚙ cycles targets, filters | — | ⚙ independent selection (not linked) | 🗣 tells Weapons who |
| **Ship heading / position** | both | info | — | ✅ | ⚙ controls | 👁 implicit | — blind | 👁 implicit | — asks Pilot 🗣 |
| **Thrust / strafe / boost** | both | action | Per-Role Input | ✅ | ⚙ WASD + gamepad | — | — | — | 🗣 orders Pilot |
| **Afterburner** | combat | action | — | ✅ | ⚙ fuel + activation | — | — | — | — |
| **Warp level** | cruise | action | — | ✅ | ⚙ level up/down | — | — | — | 🗣 orders Pilot |
| **Warp frequency** | cruise | info | Info Lock | ✅ | — blind 🗣 must be told | — | ⚙ sets freq | — | 🗣 routes Eng→Pilot |
| **Docking** | cruise | action | — | ✅ | ⚙ toggle | — | — | — | — |
| **Chain gun** | combat | action | Per-Role Input | ✅ | — | ⚙ fire, load, select ammo | — | — | — |
| **Torpedo tubes** | combat | action | Per-Role Input | ✅ | — | ⚙ fire, load, select ammo/tube | — | — | — |
| **Ammo inventory** | combat | info | — | ✅ | — | 👁 ammo counts | — | — | — asks Weapons 🗣 |
| **Per-system power** | both | resource | Asymmetric Readout | ✅ | 👁 own systems only | 👁 own systems only | ⚙ sets all (0–1.0) | 👁 radar only | — asks Eng 🗣 |
| **Per-system coolant** | both | resource | Internal-View | ✅ | — blind | — blind | ⚙ sets ratios, finite pool | — blind | — |
| **Per-system heat** | combat | resource | Internal-View | ✅ | — blind | — blind | 👁 all heat levels | — blind | — asks Eng 🗣 |
| **System status** | both | info | Asymmetric Readout | ✅ | 👁 own systems | 👁 own systems | 👁 full table, all systems | 👁 radar only | — asks Eng 🗣 |
| **Defectible details** | combat | info | Internal-View | ✅ | — blind | — blind | 👁 per-defectible values | — blind | — asks Eng 🗣 |
| **Energy pool** | both | resource | — | ✅ | — | — | 👁 engineering status | — | — asks Eng 🗣 |
| **Reactor output** | both | resource | — | ✅ | — | — | ⚙ power level | — | — |
| **Effectiveness formula** | both | resource | — | ✅ | feels it (response) | feels it (fire rate) | 👁 understands (power × coolant × hacked) | feels it (range) | — |
| **Energy → heat cascade** | combat | resource | — | ✅ | causes (thrust) | causes (firing) | 👁 + manages (coolant) | causes (radar) | — |
| **Heat → damage cascade** | combat | resource | — | ✅ | suffers (degraded thrust) | suffers (degraded fire) | 👁 sees damage occur | suffers (degraded range) | — |
| **Armor plates** | combat | info | — | ✅ | 👁 armor status | — | 👁 armor status | — | — |
| **Combat damage events** | combat | info | — | ✅ | causes (exposure) | causes (return fire) | 👁 sees + ⬜ would repair | — | 🗣 decides priority |
| **Repair** | combat | action | — | ⬜ | — | — | ⬜ not built (back-door slider, no skill gate) | — | — |
| **Scan initiation** | both | action | — | ✅ | — | — | — | ⚙ player-triggered job queue | — |
| **Hack initiation** | combat | action | — | ✅ | — | — | — | ⚙ player-triggered job queue | — |
| **Hack effect on enemy** | combat | info | — | 🟡 | — | 👁 enemy degraded | — | ⬜ would initiate | — |
| **Signals subsystem** | both | resource | — | ✅ | — | — | ⚙ dedicated system (power/coolant/heat) | 👁 own subsystem status | — |
| **Supplies to others** | both | output | — | varies | position, heading (implicit) | ❌ nothing (pure sink) | power, coolant, warp freq | scan level to radars; ⬜ hack | orders, priority |

---

## Pattern Inventory (derived from flags above)

| Pattern | Rows demonstrating it | Strength | Notes |
|---------|----------------------|----------|-------|
| **Info Lock** | scan levels, warp frequency | ✅ / 🟡 | Warp freq: strong but infrequent. Scan level: strong but Signals can't act yet. |
| **Asymmetric Readout** | per-system power, system status | ✅ | Eng sees full table, others see filtered. Load-bearing for Captain role. |
| **Consoleless Coordinator** | (Captain column throughout) | ✅ | Every "— asks X 🗣" cell is evidence. |
| **Internal-View Role** | coolant, heat, defectibles | ✅ | Eng has no radar, no contacts. Must be told everything external. |
| **Scale Differential** | radar range, contact detection | 🟡 | Signals 250km vs Weapons 5km. No sector/strategic scale yet. |
| **Per-Role Input Modality** | thrust, chain gun, torpedoes | ✅ | Each station has distinct physical controls. |
| **Recurrent Numerical Handoff** | warp frequency | 🟡 | Exists but rarely changes mid-session. No per-encounter fresh number. |
| **Cooperative Action Chain** | warp sequence (freq→level) | 🟡 | Only 2 stations. No 3+ station chains. |
| **Forced Report Trigger** | — | ❌ | No mechanical event forces any station to announce. |
| **Range-Limited Action by Proxy** | — | ❌ | No action requires another station's positioning. |
| **Solo Minigame (anti-pattern)** | scan, hack, repair (all TBD) | ⚠️ | Design risk — must add cross-station inputs. |
| **Weapons as sink** | supplies to others row | ❌ | Weapons returns nothing to bridge. |
| **Signals subsystem collapse** | signals subsystem row | ✅ | Dedicated Signals system with independent power/coolant/heat tradeoff. |

---

## Row Grouping Quick Reference

**By Phase:**
- `cruise` only: warp level, warp frequency, docking
- `combat` only: afterburner, chain gun, torpedoes, ammo, heat, defectibles, armor, damage, repair, hack
- `both`: radar, contacts, scan, power, coolant, status, energy, effectiveness

**By Flow:**
- `resource` (7 rows): power, coolant, heat, energy, reactor, effectiveness, energy→heat, heat→damage
- `info` (9 rows): radar, contacts, scan levels, heading, system status, defectibles, armor, damage events, hack effect
- `action` (9 rows): target selection, thrust, afterburner, warp level, docking, chain gun, torpedoes, scan, hack, repair
- `output` (1 row): what each station supplies to others

**By Pattern:**
- Info Lock: scan levels, warp frequency
- Asymmetric Readout: per-system power, system status
- Internal-View: coolant, heat, defectibles
- Scale Differential: radar range, contacts
- ❌ Missing: Forced Report Trigger, Range-Limited Action by Proxy, Recurrent Numerical Handoff (strong form)
