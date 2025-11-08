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

**Library:** `detect-collisions` v9.5.3 (spatial hashing)

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
```typescript
function applyDamage(target: Spaceship, damage: number, hitPos: Position) {
    const hitAngle = angleFromCenter(target.position, hitPos);
    const plate = findClosestArmorPlate(target.armor, hitAngle);
    plate.health -= damage;

    if (plate.health <= 0) {
        plate.broken = true;
        const penetration = -plate.health * PENETRATION_FACTOR;
        damageRandomSystem(target, penetration);
    }
}
```

### Sectional Armor
```typescript
class Armor {
    plates: ArmorPlate[] = [
        { angle: 0,   health: 100 },  // Front
        { angle: 90,  health: 80 },   // Right
        { angle: 180, health: 70 },   // Rear
        { angle: 270, health: 80 }    // Left
    ];
}
```

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
| HelmAssist | `logic/helm-assist.ts` | calculateInterceptCourse, calculateApproachVector, calculateOrbitPath, predictPosition |
| GunnerAssist | `logic/gunner-assist.ts` | calculateLead, predictImpact, calculateFiringSolution, isInRange |

## Performance

**Collision:** O(n log n) avg, O(n²) worst → consider quadtree if >300 objects

**Rendering:** 30 FPS client cap (prevent GPU overheat), 60 Hz server physics

**State Updates:** Batched per game tick, delta compression

**Related:** [SUBSYSTEMS.md](SUBSYSTEMS.md) | [ARCHITECTURE.md](ARCHITECTURE.md) | [PATTERNS.md](PATTERNS.md)
