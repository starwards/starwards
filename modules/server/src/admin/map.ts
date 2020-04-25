import { Asteroid, SpaceObject, Spaceship, Vec2 } from '@starwards/model';
import { nanoid, customAlphabet } from 'nanoid';
const shipId = customAlphabet('0123456789abcdef', 5);
const speedMax = 50;
const asteroidSize = 30;

const asteroids = Array(1000)
    .fill(null)
    .map<SpaceObject>(() => new Asteroid(nanoid(), new Vec2(0, 0), Math.random() * asteroidSize));
asteroids.forEach((o) => {
    o.velocity = Vec2.Rotate({ x: Math.random() * speedMax, y: 0 }, (Math.random() * 360 * 10) % 360);
});

function newShip() {
    const ship = new Spaceship(shipId(), new Vec2(0, 0), 10);
    ship.angle = Math.random() * 360 * 10;
    ship.velocity = Vec2.Rotate({ x: speedMax / 2, y: 0 }, ship.angle);
    return ship;
}

export const map = [...asteroids, newShip(), newShip()];
