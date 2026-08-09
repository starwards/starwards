import {
    Asteroid,
    Derelict,
    Explosion,
    Faction,
    Projectile,
    ShipModel,
    SpaceObject,
    Spaceship,
    Vec2,
    Waypoint,
    XY,
} from '@starwards/core';

import EventEmitter2 from 'eventemitter2';

interface MockSpaceState {
    objects: Map<string, SpaceObject>;
    get(id: string): SpaceObject | undefined;
    getShip(id: string): Spaceship | undefined;
    getAll<T extends SpaceObject>(type: string): Iterable<T>;
    [Symbol.iterator](): IterableIterator<SpaceObject>;
}

interface MockSpaceDriver {
    events: EventEmitter2;
    state: MockSpaceState;
    command: () => void;
}

export function createMockShip(
    overrides: Partial<{
        id: string;
        position: XY;
        angle: number;
        faction: number;
        velocity: XY;
        turnSpeed: number;
    }> = {},
): Spaceship {
    const ship = new Spaceship();
    ship.id = overrides.id ?? `ship-${Math.random().toString(36).substr(2, 9)}`;
    if (overrides.position) {
        ship.position.x = overrides.position.x;
        ship.position.y = overrides.position.y;
    }
    ship.angle = overrides.angle ?? 0;
    ship.faction = overrides.faction ?? 0;
    if (overrides.velocity) {
        ship.velocity.x = overrides.velocity.x;
        ship.velocity.y = overrides.velocity.y;
    }
    ship.turnSpeed = overrides.turnSpeed ?? 0;
    return ship;
}

export function createMockAsteroid(
    overrides: Partial<{
        id: string;
        position: XY;
        radius: number;
    }> = {},
): Asteroid {
    const asteroid = new Asteroid();
    asteroid.id = overrides.id ?? `asteroid-${Math.random().toString(36).substr(2, 9)}`;
    if (overrides.position) {
        asteroid.position.x = overrides.position.x;
        asteroid.position.y = overrides.position.y;
    }
    asteroid.radius = overrides.radius ?? 50;
    return asteroid;
}

export function createMockDerelict(
    overrides: Partial<{
        id: string;
        position: XY;
        radius: number;
        faction: Faction;
        callsign: string;
        angle: number;
        model: ShipModel | null;
    }> = {},
): Derelict {
    return new Derelict().init(
        overrides.id ?? `derelict-${Math.random().toString(36).substr(2, 9)}`,
        Vec2.make(overrides.position ?? { x: 0, y: 0 }),
        overrides.radius ?? 50,
        overrides.faction ?? Faction.NONE,
        overrides.callsign ?? '',
        overrides.angle ?? 0,
        overrides.model ?? null,
    );
}

export function createMockExplosion(
    overrides: Partial<{
        id: string;
        position: XY;
        radius: number;
        breachHit: boolean;
    }> = {},
): Explosion {
    const explosion = new Explosion().init(
        overrides.id ?? `explosion-${Math.random().toString(36).substr(2, 9)}`,
        Vec2.make(overrides.position ?? { x: 0, y: 0 }),
        20,
    );
    explosion.radius = overrides.radius ?? 200;
    explosion.breachHit = overrides.breachHit ?? false;
    return explosion;
}

export function createMockWaypoint(
    overrides: Partial<{
        id: string;
        position: XY;
    }> = {},
): Waypoint {
    const waypoint = new Waypoint();
    waypoint.id = overrides.id ?? `waypoint-${Math.random().toString(36).substr(2, 9)}`;
    if (overrides.position) {
        waypoint.position.x = overrides.position.x;
        waypoint.position.y = overrides.position.y;
    }
    return waypoint;
}

export function createMockProjectile(
    overrides: Partial<{
        id: string;
        position: XY;
    }> = {},
): Projectile {
    const projectile = new Projectile();
    projectile.id = overrides.id ?? `shell-${Math.random().toString(36).substr(2, 9)}`;
    if (overrides.position) {
        projectile.position.x = overrides.position.x;
        projectile.position.y = overrides.position.y;
    }
    projectile.radius = 1;
    return projectile;
}

export function createMockSpaceDriver(objects: SpaceObject[] = []): MockSpaceDriver {
    const objectMap = new Map<string, SpaceObject>();
    for (const obj of objects) {
        objectMap.set(obj.id, obj);
    }

    const state: MockSpaceState = {
        objects: objectMap,
        get(id: string) {
            return objectMap.get(id);
        },
        getShip(id: string) {
            const obj = objectMap.get(id);
            return obj && Spaceship.isInstance(obj) ? obj : undefined;
        },
        *getAll<T extends SpaceObject>(type: string): Iterable<T> {
            for (const obj of objectMap.values()) {
                if (obj.type === type) {
                    yield obj as T;
                }
            }
        },
        *[Symbol.iterator]() {
            yield* objectMap.values();
        },
    };

    return {
        events: new EventEmitter2({ wildcard: true, delimiter: '/', maxListeners: 0 }),
        state: state,
        command: () => {},
    };
}
