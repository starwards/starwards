# Armor, Damage & Ship Systems

> **See also:** [`docs/PHYSICS.md`](../../PHYSICS.md) and [`docs/SUBSYSTEMS.md`](../../SUBSYSTEMS.md) — implementation-level detail on damage application, sectional armor geometry, and per-system effectiveness formulas.

## Core Philosophy: Malfunction Over Destruction

Ships never auto-explode. Damage causes malfunctions that create gameplay. TPK is always a GM decision, not an algorithm. This is fundamental to LARP play — organizers need narrative control.

## Armor System (Done)

Sectional plates arranged around the hull absorb damage based on hit angle. Each plate has independent health. When a plate's health reaches 0, damage penetrates to the systems behind it. Ships wear an armor *model* (Composite, Whipple, Hardened, Reactive, Faraday) whose resistance to each ammo type is data-driven — see the [Damage Model Spec](damage-model-spec.md) for the full armor × ammo interaction.

**Key design:** Armor is only repairable at shipyards/stations — creating a "cost of combat" that drives docking gameplay and narrative beats ("we need to get to a station for repairs").

## Damage & Malfunctions (Done)

Two types:
- **Soft problems:** Increase probability of further malfunctions without direct performance impact
- **Hard problems:** Directly reduce system effectiveness

When damage penetrates armor, the ammo's damage profile decides which systems take the hit — one random system for penetrators, every system in the arc for blast, electronics ship-wide for EMP; shrapnel affects only hull-mounted (external) systems and never penetrates (see the [Damage Model Spec](damage-model-spec.md)). System effectiveness drops. At low enough levels, the system breaks entirely (effectiveness = 0).

## System Effectiveness (Done)

Universal formula across all systems:
```
effectiveness = broken ? 0 : power x coolantFactor x (1 - hacked)
```

This single formula creates deep interconnected gameplay:
- Engineer allocates **power** (SHUTDOWN/LOW/MID/HIGH/MAX)
- Engineer allocates **coolant** (dissipates heat)
- Signals officer can **hack** enemy systems (50% reduction)
- Physical **damage** can break systems entirely

## Power Distribution (Done)

Reactor generates energy. Systems request power via their power setting. If total demand exceeds supply, all systems scale down proportionally. The engineer's job is triage — who gets power.

## Heat Management (Done)

Active systems generate heat. Coolant dissipates it. If heat exceeds maximum, the system takes damage. This creates a tension: running systems at MAX power generates heat fast, requiring coolant allocation, which is a finite resource.

Overheat cascades: one overheating system can break, reducing the ship's capability, increasing load on remaining systems, causing more overheating.

## Weapons (Done)

Three engagement circles:
- **Close (< 1000m):** ChainGun — rapid-fire, three shell types (HiExp / ArmPen / Frag; dragonfly magazine 2400/1200/2000)
- **Medium (1000-4000m):** Railgun — charge time weapon (planned, not built)
- **Long (4000m+):** Missiles — six homing types incl. dual-mode Cluster (per-type speed/agility/lifetime, 100m proximity detonation; see the [Damage Model Spec](damage-model-spec.md) ammo catalog)

Chain reaction explosions: destroyed ships create secondary blast with inverse-square falloff.

## Repair System (Designed — MS3 Phase 4)

Three tiers planned:
1. **Field repair:** Crew fixes minor issues in-flight (limited)
2. **Docked repair:** Ship must dock at a station (more thorough)
3. **Shipyard repair:** Full restoration including armor (narrative event)

Node-RED integration planned for physical repair props (lights, switches, physical tasks).
