import { Asteroid, SpaceObject, Spaceship, Vec2 } from '@starwards/model';
import { makeId } from './id';
const speedMax = 50;

const asteroids = Array(0)
    .fill(null)
    .map<SpaceObject>(() => new Asteroid().init(makeId(), new Vec2(0, 0)));
asteroids.forEach((o) => {
    o.velocity = Vec2.Rotate({ x: Math.random() * speedMax, y: 0 }, (Math.random() * 360 * 10) % 360);
});

export function newShip(id: string) {
    const ship = new Spaceship().init(id, new Vec2(0, 0));
    ship.angle = Math.random() * 360 * 10;
    ship.velocity = Vec2.Rotate({ x: speedMax / 2, y: 0 }, ship.angle);
    return ship;
}

const shipA = new Spaceship().init('A', new Vec2(-100, 0));
shipA.angle = 0;
const shipB = new Spaceship().init('B', new Vec2(100, 0));
shipB.angle = 180;
export const map = [...asteroids, shipA, shipB]; //newShip('A'), newShip('B')];
