# ECR (Engineering Control Room)

**Status:** Done
**Crew role:** Chief Engineer — manages power, heat, and system health.

## What it does

The engineer allocates power and coolant across all ship systems, monitors heat levels, and responds to malfunctions. Every system's effectiveness follows one formula:

```
effectiveness = broken ? 0 : power x coolantFactor x (1 - hacked)
```

Power levels: SHUTDOWN (0), LOW (0.25), MID (0.5), HIGH (0.75), MAX (1.0)

## What's built

- Power distribution across all systems (reactor → allocation → load balancing)
- Heat accumulation and dissipation (overheat → damage → broken cascade)
- Coolant management (per-system allocation)
- System health monitoring
- Damage tracking via @defectible decorator
- Warp drive controls
- Armor status widget

## What's planned

- Repair system — 3 tiers (field repair, docked repair, shipyard)
- Hull damage model ([#1187](https://github.com/starwards/starwards/issues/1187)) — 2-state (ok/damaged) for IoT alerts
- Advanced damage reports with narrative descriptions
- Node-RED integration for physical repair props (lights, switches)

## Gameplay notes

The engineer's job during combat is triage: which systems get power, which get coolant, which can be allowed to overheat temporarily. During damage, they report system status to the captain using their own abstractions ("Core at 80%") while seeing the actual technical state. This information asymmetry between stations is by design.
