# Design Philosophy

Core principles driving Starwards development.

## Anti-Abstraction Game Design

**No hit points or damage points.** Ships have concrete system states, not abstract health metrics. When a thruster breaks, the ship drifts. When armor breaches, projectiles penetrate. Players create their own abstractions from technical data - an engineer might report "core at 80%" while viewing actual reactor output, coolant flow, and heat buildup.

This builds role differentiation. Same data, different interpretations per station.

## Hard Sci-Fi Foundation

Internal coherence over convenience. No energy shields - armor plates absorb damage. No magic explanations - systems follow physics. Projectiles travel indefinitely in space; weapon "range" is effectiveness, not distance.

**Fighter Justification:** In pure hard sci-fi, fighters make little sense - torpedoes are unmanned fighters without life support constraints. We chose fun and LARP value over absolute realism, but design combat environments that justify fighter existence.

## LARP-Specific Needs

### TPK Control
Game rules never auto-destroy player ships. Total Party Kill is a GM decision, not a dice roll. Ship destruction ends games prematurely in LARP contexts.

### Malfunction Over Destruction
Damage causes malfunctions that handicap but don't eliminate:
- **Soft problems:** Increase malfunction probability, don't hinder performance
- **Hard problems:** Directly reduce system effectiveness

Players diagnose and mitigate problems, creating gameplay opportunities.

### Platform Flexibility
Modular widget-based screens. Organizers drag-and-drop components for custom stations. Different LARP scales need different interfaces.

## UI Philosophy

"Interaction is essentially negative" - Bret Victor

Screens display information with minimal interactive elements. Physical controls (joysticks, keyboards) over touchscreens. Information density creates tasks - pilots see thrust vectors while engineers see power distribution.

## Three Engagement Circles

Weapons belong to effectiveness ranges:
1. **Close:** CIWS chaingun, high rate of fire, airburst rounds
2. **Intermediate:** Railguns, charge time limits close use, dodgeable at long range
3. **Long:** Self-propelled torpedoes with guidance

Each weapon functions outside its circle at drastically reduced effectiveness.

## System Effectiveness

`power × coolantFactor × (1 - hacked)`

Simple formula, deep tactics. Energy allocation, heat management, and cyber warfare create interconnected trade-offs.

## Development Methodology

**Lean Milestones:** Achieve MVP, then advance. Avoid tunnel vision on single features.

**Milestone Selection Criteria:**
1. Primary game mechanic (repeated player activity)
2. Team has solid grasp of desired feel
3. Independent of undesigned mechanisms
4. Foundation for other derivations
5. Packageable as testable experience

**Example:** Dogfight milestone drove steering, maneuvering, aiming, ballistics - branching later to complex combat, larger ships, GM tools.