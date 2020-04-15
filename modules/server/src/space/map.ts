import { Asteroid, SpaceObject } from '@starwards/model';
import { Vec2 } from '@starwards/model';
import nanoid from 'nanoid';
import { Spaceship } from '@starwards/model';

const speedMax = 50;
const asteroidSize = 30;
export const shipId = 'shippy mcshipface';

export const map = Array(1000)
    .fill(null)
    .map<SpaceObject>(() => new Asteroid(nanoid(), new Vec2(0, 0), Math.random() * asteroidSize));
map.forEach((o) => {
    o.velocity = Vec2.Rotate({ x: Math.random() * speedMax, y: 0 }, (Math.random() * 360 * 10) % 360);
});
const ship = new Spaceship(shipId, new Vec2(0, 0), 10);
ship.angle = Math.random() * 360 * 10;
ship.velocity = Vec2.Rotate({ x: speedMax / 2, y: 0 }, ship.angle);
map.push(ship);
