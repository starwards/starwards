---
audience: agent
depth: deep
source_of_truth:
  - modules/core/src/logic/space-manager.ts
  - modules/core/src/logic/xy.ts
related:
  - SUBSYSTEMS.md
last_verified: 2026-07-20
---

# Physics System

**Server-authoritative physics with circular collision detection and raycast**

## SpaceManager
**Location:** `modules/core/src/logic/space-manager.ts`

**Responsibilities:** Collision detection | Raycast | Motion | Damage | Explosions | Docking

### Update Loop
```typescript
update(dt: IterationData) {
    updateVelocities(dt);     // F = ma
    updatePositions(dt);      // x = x0 + vt
    detectCollisions();       // Circle-circle
    updateProjectiles(dt);    // Raycast
    updateExplosions(dt);     // Blast propagation
    updateAttachments();      // Docking
}
```

### Equations of Motion
```typescript
// Position: x(t) = x0 + v0*t + (a*t²)/2
position.x += velocity.x * dt;

// Velocity: v(t) = v0 + a*t
velocity.x += acceleration.x * dt;
```

## Collision Detection

**Library:** `detect-collisions` (spatial hashing) — version in [DEPENDENCIES.md](DEPENDENCIES.md)

**Complexity:**
- Naive: O(n²) → comparisons = n×(n-1)/2
- Optimized: O(n log n) avg w/ spatial hashing
- Worst: O(n²) for dense distributions

**Implementation:**
```typescript
import { System, Circle } from 'detect-collisions';
const collisionSys = new System();
const circle = collisionSys.createCircle(ship.position, ship.radius);

// Update & check
circle.x = ship.position.x;
circle.y = ship.position.y;
for (const other of circle.potentials()) {
    if (circle.collides(other)) handleCollision(ship, other.object);
}
```

**Collision Response:**
```typescript
// Calculate impulse
const normal = normalize(subtract(objB.position, objA.position));
const relVel = subtract(objA.velocity, objB.velocity);
const impulse = -(1 + restitution) * dot(relVel, normal) / (1/massA + 1/massB);

// Apply impulse + separate
objA.velocity = add(objA.velocity, scale(normal, impulse / massA));
objB.velocity = subtract(objB.velocity, scale(normal, impulse / massB));
```

## Projectile Raycast

**Why:** Fast projectiles tunnel through objects between frames

**Ray-Sphere Intersection:**
```typescript
function raycast(rayOrigin, rayDir, sphereCenter, sphereRadius) {
    const oc = subtract(rayOrigin, sphereCenter);
    const a = dot(rayDir, rayDir);
    const b = 2.0 * dot(oc, rayDir);
    const c = dot(oc, oc) - radius²;
    const discriminant = b² - 4ac;

    if (discriminant < 0) return null;  // No hit
    const t = (-b - √discriminant) / 2a;
    if (t < 0) return null;  // Behind ray
    return { point: rayOrigin + rayDir*t, distance: t };
}
```

**Projectile Update:**
```typescript
const startPos = projectile.position.clone();
const dist = length(velocity) * dt;
projectile.position = add(startPos, scale(normalize(velocity), dist));

for (const obj of spaceObjects) {
    const hit = raycast(startPos, normalize(velocity), obj.position, obj.radius);
    if (hit && hit.distance <= dist) {
        applyDamage(obj, projectile.damage, hit.point);
        destroyProjectile(projectile);
        return;
    }
}
```

## Weapon Design

### Three Engagement Circles

Weapons are designed for specific effectiveness ranges:

1. **Close Range (CIWS):** Chaingun with airburst rounds
   - High rate of fire, projectile velocity over accuracy
   - Airburst detonates at set range for area denial
   - Perfect for fighters/torpedoes, ineffective vs armored ships

2. **Intermediate Range:** Railguns (planned)
   - Charge time prevents close use
   - Dodgeable at long range due to travel time
   - Optimal for mid-range engagements

3. **Long Range:** Self-propelled torpedoes
   - Homing capability: 720°/s rotation
   - 60-second flight time
   - Proximity detonation at 100m

**Chaingun Selection:** External chain-powered for blowback-free operation, variable motor speed controls rate of fire, misfires don't jam (round ejects, new round loads).

## Damage System

### Damage Application

Weapon hits resolve in `DamageManager.takeWeaponDamage()` (`modules/core/src/ship/damage-manager.ts`):

```typescript
takeWeaponDamage(damage: AttackDamage) {
    applySurfaceEffect(damage);          // hull-mounted (external) systems scraped regardless of armor
    for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {  // front / rear
        exposure = walkArmorLayers(damage, areaHitRange);  // 0..1 leak-through per area
    }
    applyExposedSystemDamage(damage, exposures);  // post-armor system defects
}
```

`walkArmorLayers()` walks the armor stack outermost-in over `Armor.layerDesigns`. Each layer's response to the incoming damage type (`ArmorLayerDesignState.response()`) decides the outcome:

- **bypass** — layer is transparent to this damage type; skipped
- **block** — stops the walk; only already-broken sections leak inward
- **engage** — plates erode (`damage.amount × plateFactor × chain`) and damage leaks through via `max(penetration, brokenLayerRatio)`

Exposure chains multiplicatively across the stack; the final chain scales system damage for the area. Reactive layers (`singleUsePlates`) trigger on impact delivery only: one cell pops and defeats the whole hit (exposure measured pre-pop) unless the round fully penetrates (Tandem); explosions erode reactive cells like ordinary plates.

Post-armor damage goes through `applyExposedSystemDamage()` → `damageSystem()`: the damage profile's `systemScope` picks targets (a single random system, all systems in the exposed area, or ship-wide electronics), and each application is walked off in `damage50`-sized steps of probabilistic `@defectible` rolls (each capped at 50%) — no direct health subtraction on systems.

### Sectional Armor

Armor is modeled as N equal radial plates stored in an `ArraySchema<ArmorPlate>` (`modules/core/src/ship/armor.ts`; e.g. 12 plates for the dragonfly design). Each plate spans `360/numberOfPlates` degrees, with its angular position derived from its array index rather than a stored angle. Each plate holds `layers = ArraySchema<ArmorLayer>` — outermost first, indexed in lockstep with `Armor.layerDesigns` — and each layer carries `health`/`maxHealth`, with `plateMaxHealth` set per layer by the matching `ArmorLayerDesignState`. `plate.broken` is a getter: true only when every layer of the plate is down.

## Explosion Propagation

```typescript
function propagateExplosion(explosion: Explosion) {
    for (const obj of spaceObjects) {
        const dist = distanceBetween(explosion.position, obj.position);
        if (dist <= explosion.radius) {
            const falloff = 1.0 - (dist / explosion.radius);
            const damage = explosion.damage * falloff²;  // Inverse square
            applyDamage(obj, damage, explosion.position);

            // Blast force
            const dir = normalize(subtract(obj.position, explosion.position));
            const force = EXPLOSION_FORCE * falloff;
            applyImpulse(obj, scale(dir, force));
        }
    }
}
```

**Chain Reactions:** Destroyed ships create secondary explosions → cascading

## Attachment System

**Purpose:** Ship-to-ship docking (repair, resupply, boarding)

```typescript
// Attach
ship.docking.docked = true;
ship.docking.dockedTo = target.id;
ship.docking.relativePosition = subtract(ship.position, target.position);
ship.docking.relativeAngle = ship.angle - target.angle;

// Update compound movement
ship.position = add(parent.position, rotate(ship.docking.relativePosition, parent.angle));
ship.angle = parent.angle + ship.docking.relativeAngle;
ship.velocity = parent.velocity.clone();
```

## Helper Systems

| System | Location | Functions |
|--------|----------|-----------|
| HelmAssist | `logic/helm-assist.ts` | rotationFromTargetTurnSpeed, matchGlobalSpeed, matchLocalSpeed, moveToTarget, rotateToTarget |
| GunnerAssist | `logic/gunner-assist.ts` | predictHitLocation, calcRangediff, getKillZoneRadiusRange, isTargetInKillZone, calcShellSecondsToLive, getShellAimVelocityCompensation, getShellExplosionLocation, getTargetLocationAtShellExplosion |

## Performance

**Collision:** O(n log n) avg, O(n²) worst → consider quadtree if >300 objects

**Rendering:** 30 FPS client cap (prevent GPU overheat), 60 Hz server physics

**State Updates:** Batched per game tick, delta compression

**Related:** [SUBSYSTEMS.md](SUBSYSTEMS.md) | [ARCHITECTURE.md](ARCHITECTURE.md) | [PATTERNS.md](PATTERNS.md)
