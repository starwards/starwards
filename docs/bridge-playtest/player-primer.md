# Starwards bridge — player primer

Keys are as the game binds them; unchecked items are marked **(may differ in your build)**. **`SPACE` on any station opens that screen's hotkey help.**

## Overview

- Five people, one ship (**Gravitas**): Pilot, Weapons, Signals, Engineer at screens; Captain has no screen.
- Ship: forward-fixed chaingun, two missile tubes, 70 km omni radar + steerable 50 km scan beam, 1,000-energy reactor pool, afterburner (gamepad only).
- Systems run at `power × (1 − hacked)`, zero when broken. Use spends shared energy; fast spending makes heat; over-limit heat damages; damaged systems drift (guns miss, thrusters skew, radar flickers) then break. Engineer sets power/coolant and runs repairs (30–240 s, draw energy, usually darken a system).
- Only Engineer sees power/heat/damage; only Signals sees far and identifies contacts (Weapons sees 5 km); gun points where Pilot points; Signals' and Weapons' targets are **separate**. Say contact names aloud ("Asteroid 47").
- Unknown contact = **UFO** (grey dot, no name). Scan tiers UFO → BASIC (faction, model) → SNAPSHOT/FULL (internals), 5 s per tier at full power, automatic.
- Docking: in range of a friendly station, Pilot presses `Z`. Docked: magazine refills (~150 s), energy cells restock, two docked-only repairs unlock. Undock stops restock and **cancels** a running docked-only repair.
- Scenario (wave defence): three friendly stations (Large, Small, Chaingun Platform). Waves spawn 140 km out, beyond all friendly sensors; waves 1–3 hit stations in order, wave 4+ the station furthest from you. ~4–6 min arrival; next wave 15 s after the last dies. Enemies: Dragonfly (fast fighter), Predator (stock version of your hull), Glaive (gun frigate), Cataphract (slow heavy). *(Timings are estimates.)*
- Defeat: last station destroyed. No win condition.
- Entry: lobby station button opens `pilot/weapons/signals/engineer/gm.html?ship=`. Each tab gets a 3-character station ID (lobby + GM roster). Standby screen until the GM starts a game.

---

## Pilot

**Job:** put the ship where the Captain wants it, pointing where Weapons needs it; dock when told.

**Screen**
- Radar centred on ship.
- Top-left: energy, afterburner fuel, heading, speed, turn speed, `rotationMode` / `maneuveringMode`, **Reactor energy level** (warns when low).
- Top-right: thrusters, warp, radars, manoeuvring, smart pilot. Middle-right: warp status.
- Bottom-right: **Docking** (target, mode, Closest Option). Bottom-left: armour plates.

**Keys**

| Key | Does |
|---|---|
| `Q` / `E` | Rotate left / right (both = centre) |
| `A` / `D` | Strafe left / right (both = centre) |
| `W` / `S` | Boost forward / back (both = centre) |
| `N` | Cycle rotation mode DIRECT / VELOCITY / TARGET |
| `M` | Cycle manoeuvring mode DIRECT / VELOCITY / TARGET |
| `R` / `F` | Warp level up / down (warp ships only) |
| `Z` | Dock / undock (only when Closest Option shows a station) |
| `SPACE` | Hotkey help |

Gamepad only: afterburner (btn 6), anti-drift (7), brakes (5), reset rotation offset (14); axes 0 rotate, 2 strafe, 3 boost.
DIRECT = raw thrusters. VELOCITY = hold dialled rate/speed. TARGET = face / match Weapons' target. **Smart pilot dark in VELOCITY/TARGET → steering does nothing**; go DIRECT.

**Say / Ask**
- → Weapons: "Nose on Predator 3, holding" / "Rolling left, hold fire."
- → Engineer: "Thrusters not responding" / "Need warp in 30 s."
- → Captain: "Docked" / "Energy red, no thrust."

**Mistakes**
- No steering response: VELOCITY/TARGET with dark smart pilot — `N`/`M` to DIRECT.
- `Z` with no station in Closest Option does nothing.
- Full boost during a repair: shared pool; a repair starved 2 s aborts, progress lost.

---

## Weapons

**Job:** select the target the Captain names, load before the shot is needed, fire when the Pilot gives the nose.

**Screen**
- 5 km tactical radar, gun crosshair, speed lines. Keyboard only.
- Top-left: **Tubes** (ammo selected, loaded, loading bar, safety, auto-load). Middle-left: **Ammo** (magazine counts).
- Middle-right: **Targeting** (target ID, three filters). Bottom-left: **Gun** (projectile, loaded, loading, auto-load).
- Top-right: tubes, chaingun, magazine, radars.

**Keys**

| Key | Does |
|---|---|
| `]` / `[` | Next / previous target |
| `'` | Clear target |
| `P` / `O` / `I` | Filter: ships only / enemies only / short range only |
| `F` | Fire chaingun (hold) |
| `G` | Toggle chaingun load |
| `B` | Change chaingun ammo type |
| `.` / `,` | Shell burst range further / nearer (`/` centres) |
| `X` | Fire every tube that is loaded **and** unlocked |
| `1` `2` | Toggle safety, tube 0 / 1 (`3` `4` on bigger hulls) |
| `Shift+1` `Shift+2` | Load / unload that tube |
| `Alt+1` `Alt+2` | Cycle that tube's missile type |
| `SPACE` | Hotkey help |

Missile: `Alt+1` pick → `Shift+1` load → `1` unlock → `X` fire. Tubes start locked and re-lock after every shot. Gun is forward-fixed, minimum range 500 m. Unidentified contacts: grey dots, no name.

**Say / Ask**
- → Pilot: "Nose 20 degrees right" / "Target inside minimum range, back off."
- → Signals: "Which one is the Glaive?" / "Is Contact 12 a ship or a shell?"
- → Engineer: "Gun loading slow" / "Tubes not responding."
- ← Engineer: "gun dark 45 s" precedes an Actuator recalibration.

**Mistakes**
- `X` does nothing: tube locked or not loaded — Tubes pane, `1`/`2`.
- Holding `F` continuously: heat and energy drain; fire in bursts.
- Reporting a target without its name.

---

## Signals

**Job:** identify every contact before it matters; report in words the bridge can act on.

**Screen**
- Long-range radar (50 km default; presets 5–250 km) with scan-job order markers.
- Middle-right: **Target info** (type, faction, distance, bearing). Top-right: radar systems.
- Bottom-right: **Scan Beam** sliders (direction, arc).
- Bottom-left: **Signals Jobs** — active scan (progress, cancel), queue in order (position, *paused*, **Prioritize Target**). Dormant standing orders counted, not listed.

**Keys**

| Key | Does |
|---|---|
| `]` / `[` | Next / previous contact (unknowns + identified ships) |
| `'` | Clear selection |
| `=` / `-` | Zoom in / out (mouse wheel works) |
| `A` / `D` | Swing beam left / right (5° steps) |
| `W` / `S` | Narrow / widen beam arc (narrower reaches further) |
| `SPACE` | Hotkey help |

Scans queue automatically for everything in view; top job runs, one tier per 5 s at full power (10 s at half). Lever: select contact, **Prioritize Target** — a standing order that resumes if the contact fades and returns. Displaced job loses progress. Asteroids and shells stop at BASIC. Under-powered = slower; damaged = jobs can fail.

**Say / Ask** (SALUTE order: size, activity, location, unit, time, equipment)
- → Captain: "Three contacts inbound on Small Station, 90 km, unidentified, scanning the lead." Then: "Lead is a Glaive, gun frigate."
- → Weapons: "Contact 12 is a shell, ignore; Contact 9 is the Dragonfly."
- → Engineer: "Signals slow, do I have power?"

**Mistakes**
- Assuming Weapons sees your target; give name and bearing.
- Re-prioritising every few seconds; each swap discards progress.
- Beam left where it was; it only covers where `A`/`D` point it.

---

## Engineer

**Job:** keep every station alive — power, coolant, repairs — and warn the owner before a system goes dark.

**Screen**
- Top-left: reactor energy, afterburner fuel, hull. Middle-left: warp status and frequency.
- Centre: **systems table** — status, power, energy/min, heat, coolant slider (mouse works), hacked flag, damaged sub-properties.
- Top-right: **Damage report**. Bottom-left: armour plates.
- Middle-right: **Repair Queue** — *notice* line (why an enqueue was refused), **Enqueue** buttons (hover = key, seconds, tier, what goes dark, cells left), queue entries (QUEUED / ACTIVE / DONE / CANCELLED, progress, *insufficient reactor energy* when starved, **Cancel / Move up / Move down**).

**Keys**

Power/coolant key pairs, one per system in ship order: `1`/`Q`, `2`/`W`, `3`/`E`, `4`/`R`, `5`/`T`, `6`/`Y`, `7`/`U`, `8`/`I`, `9`/`O`, `0`/`P`, `A`/`Z`, `S`/`X`, `D`/`C`, `F`/`V`, `G`/`B`, `H`/`N`, `J`/`M`, `K`/`,`, `L`/`.`. First = power up, second = down; `Shift`+same = coolant ±0.1. **Mapping depends on the ship: `SPACE` before start.**

| Key | Does |
|---|---|
| `Alt+1` | Actuator recalibration — 45 s, **chaingun dark** |
| `Alt+2` | Thrust-line purge — 60 s, **thrusters dark** |
| `Alt+3` | Feed-system overhaul — 60 s, **magazine dark** |
| `Alt+4` | Sensor-array degauss — 30 s, **radars dark** |
| `Alt+5` | Radar traverse servo alignment — 30 s, **radars dark** |
| `Alt+6` | Signal-processor retune — 30 s, **signals dark** |
| `Alt+7` | Power-train reset — 90 s, **warp + manoeuvring dark** |
| `Alt+8` | Containment-field tuning — 75 s, **warp dark** |
| `Alt+9` | Fire-control alignment — 45 s, nothing dark |
| `Alt+0` | Hull-wide systems overhaul — 240 s, nothing dark, **docked only** |
| `Alt+Q` | Armor plate renewal — heals worst plate, repeatable, **docked only** |
| `Alt+W` | Launcher servo recalibration — 45 s, **tubes dark**; re-locks tube safeties |
| `Alt+E` | Reactor jump-start — 10 s, 1 energy cell (Gravitas carries 2), +30% energy |
| `]` / `[` | Warp standby frequency up / down; `\` commits (warp ships only) |
| `SPACE` | Hotkey help |

Thirteen protocols, as listed above.
One repair at a time; reorder the queue. Dark = zero power for the whole run. All-or-nothing: cancel at 89/90 s = nothing. Starved 2 s = abort. One protocol fixes every instance (all six thrusters). Docked-only protocols show only while docked, cancel on undock.

**Say / Ask**
- → Weapons before `Alt+1`: "Gun dark 45 s, now." → Pilot before `Alt+2`: "Thrusters off 60 s."
- → Captain: "Energy 200 and falling; one long repair or the gun, not both."
- → Pilot: "Warp frequency 3 → 5 in ten seconds." (only you see it)

**Mistakes**
- Enqueueing without telling the owner of the dark system.
- Repairing the first skewed thruster; wait, one run fixes all six.
- Ignoring the *notice* line: a refused enqueue (queue full, undocked, no cells) shows nothing else.

---

## GM

**Job:** start the game, run the scenario, watch every station, fix what the crew cannot.

**Screen**
- Left: GM radar (select, drag, inspect). Right: **Tweak** / **Create** tabs.
- **Game controls**: pause / slow / play / fast, clock, restart, recording.
- **Station Roster**: `● ABC — pilot → shipId` (filled dot = connected; `unassigned` / `standby` when unbound).
- Menu adds any station's widgets (radar, repair queue, damage report, targeting, tubes, docking).

**Keys** (objects selected on GM radar)

| Key | Does |
|---|---|
| `Q` / `E` | Rotate selection (5° steps) |
| `F` | Freeze / unfreeze selection |
| `Delete` | Delete selection |
| `SPACE` | Hotkey help |

Lobby scenarios: `two_vs_one`, `solo`, `wave_defence`. Roster is **view-only** here; ships come from `?ship=` or auto-assignment. Roster reassignment from the GM screen **(may differ in your build)** — fix bindings by reopening the station URL.

**Say / Ask**
- → Engineer: any live Tweak (armour repair seconds, magazine restock, warp jam); captions update, crew's model does not.
- Do not narrate damage to Pilot/Weapons; it reaches them via the Engineer.

**Mistakes**
- Narrating a broken system the crew cannot see.
- Tweaking a live value without telling the Engineer.
- `Delete` with the wrong object selected.
