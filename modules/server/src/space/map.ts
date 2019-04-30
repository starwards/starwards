
import { Asteroid } from '@starwards/model';
import { Vec2 } from '@starwards/model';
import nanoid from 'nanoid';
import { Spaceship } from '@starwards/model';

const MAP_SIZE = 20000;
export const map = Array(1000).fill(null).map(() => new Asteroid(
    nanoid(),
    new Vec2( Math.random() * MAP_SIZE - MAP_SIZE / 2, Math.random() * MAP_SIZE - MAP_SIZE / 2)
));
map.push(new Spaceship(
    nanoid(),
    new Vec2( 0, 0)
));
