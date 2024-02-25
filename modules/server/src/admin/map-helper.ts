import { Asteroid, Faction, ShipModel, Spaceship, Vec2, makeId, sectorSize } from '@starwards/core';

const speedMax = 50;

export function newAsteroid() {
    const asteroid = new Asteroid().init(
        makeId(),
        Vec2.Rotate({ x: Math.random() * sectorSize * 2, y: 0 }, Math.random() * 360),
    );
    asteroid.radius = Math.random() * Asteroid.maxSize;
    // asteroid.velocity = Vec2.Rotate({ x: Math.random() * speedMax, y: 0 }, Math.random() * 360);
    return asteroid;
}

const locationRange = 2 * 1000;
export function newShip(id: string, faction: Faction, model: ShipModel) {
    const ship = new Spaceship();
    ship.id = id;
    ship.faction = faction;
    ship.model = model;
    resetShip(ship);
    return ship;
}

export function resetShip(ship: Spaceship) {
    ship.position = new Vec2((Math.random() - 0.5) * locationRange, (Math.random() - 0.5) * locationRange);
    // ship.angle = Math.random() * 360;
    // ship.velocity = Vec2.Rotate({ x: speedMax / 2, y: 0 }, ship.angle);
    ship.velocity = Vec2.Rotate({ x: Math.random() * speedMax, y: 0 }, Math.random() * 360);
    return ship;
}
