import { Asteroid, SpaceObject, Spaceship, Vec2 } from '@starwards/model';
import { makeId } from './id';
const speedMax = 50;

const asteroids = Array(0).fill(null).map<SpaceObject>(newAsteroid);

export function newAsteroid() {
    const asteroid = new Asteroid().init(makeId(), new Vec2(0, 0));
    asteroid.velocity = Vec2.Rotate({ x: Math.random() * speedMax, y: 0 }, Math.random() * 360);
    return asteroid;
}

const locationRange = 40 * 1000;
export function newShip(id: string) {
    const ship = new Spaceship();
    ship.id = id;
    resetShip(ship);
    return ship;
}

export function resetShip(ship: Spaceship) {
    ship.position = new Vec2((Math.random() - 0.5) * locationRange, (Math.random() - 0.5) * locationRange);
    ship.angle = Math.random() * 360;
    ship.velocity = Vec2.Rotate({ x: speedMax / 2, y: 0 }, ship.angle);
    ship.health = 1000;
    return ship;
}

const shipA = new Spaceship().init('A', new Vec2(-100, 0));
shipA.angle = 0;
const shipB = new Spaceship().init('B', new Vec2(100, 0));
shipB.angle = 180;
export const map = [...asteroids, shipA, shipB]; //newShip('A'), newShip('B')];
