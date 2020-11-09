import { makeId, Asteroid, Spaceship, Vec2, sectorSize } from '@starwards/model';
const speedMax = 50;

export function newAsteroid() {
    const asteroid = new Asteroid().init(
        makeId(),
        Vec2.Rotate({ x: Math.random() * sectorSize * 2, y: 0 }, Math.random() * 360)
    );
    asteroid.velocity = Vec2.Rotate({ x: Math.random() * speedMax, y: 0 }, Math.random() * 360);
    return asteroid;
}

const locationRange = 2 * 1000;
export function newShip(id: string) {
    const ship = new Spaceship();
    ship.id = id;
    resetShip(ship);
    return ship;
}

export function resetShip(ship: Spaceship) {
    ship.position = new Vec2((Math.random() - 0.5) * locationRange, (Math.random() - 0.5) * locationRange);
    // ship.angle = Math.random() * 360;
    // ship.velocity = Vec2.Rotate({ x: speedMax / 2, y: 0 }, ship.angle);
    ship.velocity = Vec2.Rotate({ x: Math.random() * speedMax, y: 0 }, Math.random() * 360);
    ship.health = 1000;
    return ship;
}
