
import { Asteroid, SpaceObject } from '@starwards/model';
import { Vec2 } from '@starwards/model';
import nanoid from 'nanoid';
import { Spaceship } from '@starwards/model';

const fieldSize = 10000;
const speedMax = 50;
const asteroidSize = 30;
export const shipId = 'shippy mcshipface';

export const map = Array(1000).fill(null).map<SpaceObject>(() => new Asteroid(
    nanoid(),
    new Vec2( Math.random() * fieldSize - fieldSize / 2, Math.random() * fieldSize - fieldSize / 2),
    Math.random() * asteroidSize
));
map.forEach(o =>
    o.velocity = new Vec2( (Math.random() * speedMax * 2) - speedMax, (Math.random() * speedMax * 2) - speedMax));
const ship = new Spaceship(
    shipId,
    new Vec2( 0, 0),
    10
);
ship.angle = Math.random() * 360 * 10;
ship.velocity = Vec2.Rotate({x : speedMax / 2, y : 0}, ship.angle);
map.push(ship);
