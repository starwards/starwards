---
audience: agent
depth: deep
source_of_truth:
    - modules/core/src/space
    - modules/core/src/logic/space-manager.ts
last_verified: 2026-08-18
---

# Adding a space object

How to add a new object type to space — class, union, state map, collision handling, blip renderer, and creation command. Sibling notes: [widgets](extending-widgets.md), [ship systems](extending-ship-systems.md). The contract is [`specs/SPACE_OBJECTS_SPEC.md`](../specs/SPACE_OBJECTS_SPEC.md).

### Creating New Object Type

**1. Define Object Class:**

```typescript
// modules/core/src/space/mine.ts
import { SpaceObjectBase } from './space-object-base';
import { gameField } from '../game-field';
import { Faction } from './faction';

export class Mine extends SpaceObjectBase {
    readonly type = 'Mine' as const;

    @gameField('int8')
    faction: Faction = Faction.NONE;

    @gameField('float32')
    damage = 100;

    @gameField('float32')
    triggerRadius = 5;

    @gameField('float32')
    armTime = 2; // Seconds until armed

    @gameField('boolean')
    armed = false;

    init(id: string, position: Vec2, faction: Faction): this {
        this.id = id;
        this.position = position;
        this.faction = faction;
        this.radius = 1;
        return this;
    }

    static isInstance(o: unknown): o is Mine {
        return (o as Mine)?.type === 'Mine';
    }
}
```

**2. Add to SpaceObjects Type:**

```typescript
// modules/core/src/space/index.ts
import { Mine } from './mine';

export type SpaceObjects = {
    Spaceship: Spaceship;
    Projectile: Projectile;
    Explosion: Explosion;
    Asteroid: Asteroid;
    Waypoint: Waypoint;
    Mine: Mine; // Add new type
};

export type SpaceObject = SpaceObjects[keyof SpaceObjects];
```

**3. Add to SpaceState:**

```typescript
// modules/core/src/space/space-state.ts
import { Mine } from './mine';

export class SpaceState extends Schema {
    @gameField({ map: Mine })
    private readonly Mine = new MapSchema<Mine>();

    public get(id: string): SpaceObject | undefined {
        return (
            this.Projectile.get(id) ??
            this.Asteroid.get(id) ??
            this.Spaceship.get(id) ??
            this.Explosion.get(id) ??
            this.Waypoint.get(id) ??
            this.Mine.get(id) // Add to lookup
        );
    }

    public *maps(): IterableIterator<MapSchema> {
        yield this.Projectile;
        yield this.Explosion;
        yield this.Asteroid;
        yield this.Spaceship;
        yield this.Waypoint;
        yield this.Mine; // Add to iteration
    }
}
```

**4. Add Collision Handling:**

```typescript
// modules/core/src/logic/space-manager.ts
private handleCollisions(deltaSeconds: number) {
    this.collisions.checkAll((response: SWResponse) => {
        const subject = this.collisionToState.get(response.a);
        const object = this.collisionToState.get(response.b);

        // Handle mine collisions
        if (Mine.isInstance(subject) && subject.armed) {
            if (Spaceship.isInstance(object)) {
                this.detonateMine(subject);
            }
        }

        // ... existing collision handling
    });
}

private detonateMine(mine: Mine) {
    const explosion = new Explosion();
    explosion.init(
        uniqueId('explosion'),
        mine.position.clone(),
        mine.damage / 100
    );
    this.insert(explosion);
    mine.destroyed = true;
}
```

**5. Add Blip Renderer:**

```typescript
// modules/browser/src/radar/blips/blip-renderer.ts
import { Mine } from '@starwards/core';

function renderMine(mine: Mine, graphics: Graphics) {
    graphics.beginFill(0xff0000);
    graphics.drawCircle(0, 0, mine.radius);
    graphics.endFill();

    if (!mine.armed) {
        // Draw arming indicator
        graphics.lineStyle(1, 0xffff00);
        graphics.drawCircle(0, 0, mine.triggerRadius);
    }
}

// Add to renderer map
const renderers = {
    // ... existing renderers
    Mine: renderMine,
};
```

**6. Add Creation Command:**

```typescript
// modules/core/src/space/space-commands.ts
export type CreateMineOrderArg = {
    position: XY;
    faction: Faction;
};

// In SpaceState
public createMineCommands = Array.of<CreateMineOrderArg>();

// In SpaceManager.update()
for (const cmd of this.state.createMineCommands) {
    const mine = new Mine().init(
        makeId(),
        Vec2.make(cmd.position),
        cmd.faction
    );
    this.insert(mine);
}
this.state.createMineCommands = [];
```
