import { Spaceship } from '../src';

interface ShipConfigOverrides {
    id?: string;
    x?: number;
    y?: number;
    angle?: number;
    faction?: number;
    velocity?: { x: number; y: number };
    configName?: string;
}

export function createTestShip(overrides: ShipConfigOverrides = {}): Spaceship {
    const ship = new Spaceship();

    ship.id = overrides.id ?? `test-ship-${Math.random().toString(36).substr(2, 9)}`;
    ship.position.x = overrides.x ?? 0;
    ship.position.y = overrides.y ?? 0;
    ship.angle = overrides.angle ?? 0;
    ship.faction = overrides.faction ?? 0;

    if (overrides.velocity) {
        ship.velocity.x = overrides.velocity.x;
        ship.velocity.y = overrides.velocity.y;
    }

    return ship;
}
