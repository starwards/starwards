# Flight Mechanics

Guide to piloting in Newtonian space.

## Flight Modes

### Velocity Mode (Default)
Computer-assisted flight. Helm sets desired velocity, autopilot adjusts thrusters to match.

- **Helm at rest:** Ship aims for zero velocity
- **Helm forward:** Ship accelerates to set speed
- **Auto-correction:** Computer counters drift automatically
- **Use when:** Normal flight, undamaged ship

### Direct Mode
Manual thruster control. Helm commands translate directly to thruster output.

- **Helm at rest:** Thrusters idle, ship maintains current velocity
- **Helm forward:** Forward thrusters fire continuously
- **No assistance:** Pilot manages all physics manually
- **Use when:** Damaged thrusters, precision maneuvers, drift recovery

## Drift Management Protocol

When thruster damage causes asymmetric thrust:

1. **Identify drift direction** - Note which way ship is sliding
2. **Switch to Direct mode** - Take manual control
3. **Rotate 90°** - Align working thrusters perpendicular to drift
4. **Return to Velocity mode** - Let computer use rotated thrusters to counter drift
5. **Apply counter-thrust** - Working thrusters now oppose drift vector

**Example:** Starboard thruster broken
- Ship drifts right (can't push left)
- Rotate nose 90° right in Direct mode
- Switch to Velocity mode
- Forward/back thrusters now push left/right
- Drift countered in seconds

## Controls

| Control | Range | Effect |
|---------|-------|--------|
| **rotation** | [-1,1] | Turn left/right |
| **boost** | [-1,1] | Forward/reverse thrust |
| **strafe** | [-1,1] | Lateral movement |
| **antiDrift** | [0,1] | Oppose current velocity |
| **breaks** | [0,1] | Rapid deceleration |
| **afterBurner** | [0,1] | Rotation boost (generates heat) |

## Newtonian Physics

**No drag:** Ships maintain velocity indefinitely without thrust.

**Momentum conservation:** Every action has equal/opposite reaction.

**Rotation independence:** Ship can face any direction while moving another.

**Additive velocities:** New thrust adds to existing velocity vector.

## Combat Maneuvering

### Strafing Run
1. Accelerate toward target
2. Rotate 90° while maintaining velocity
3. Fire while sliding past laterally
4. Rotate back and boost away

### Drift Fighting
1. Build up speed toward target
2. Rotate 180° (now flying backward)
3. Fire while retreating at full speed
4. Use antiDrift to stop when safe

### Thruster Damage Tactics
- Use rotation to bring working thrusters to bear
- Drift intentionally to maintain unpredictable movement
- Switch between modes to confuse opponents

## Tips

- **Velocity Mode** handles most situations automatically
- **Direct Mode** essential when damaged or for tricks
- **Afterburner** generates significant heat - use sparingly
- **antiDrift** useful for quick stops without rotating
- **Strafe** allows dodging without changing facing