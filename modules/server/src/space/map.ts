
import { Asteroid } from '@starwards/model';
import { Vec2 } from '@starwards/model';
import nanoid from 'nanoid';
import { Spaceship } from '@starwards/model';

const fieldSize = 10000;
const speedMax = 0.05;
const asteroidSize = 30;
export const map = Array(1000).fill(null).map(() => new Asteroid(
    nanoid(),
    new Vec2( Math.random() * fieldSize - fieldSize / 2, Math.random() * fieldSize - fieldSize / 2),
    Math.random() * asteroidSize
));
map.forEach(o =>
    o.velocity = new Vec2( (Math.random() * speedMax * 2) - speedMax, (Math.random() * speedMax * 2) - speedMax));
const ship = new Spaceship(
    nanoid(),
    new Vec2( 0, 0),
    10
);
ship.angle = Math.random() * 360 * 10;
ship.velocity = Vec2.Rotate({x : speedMax / 2, y : 0}, ship.angle);
map.push(ship);
