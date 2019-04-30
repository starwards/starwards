
import { Asteroid } from '@starwards/model';
import { Vec2 } from '@starwards/model';
import nanoid from 'nanoid';
import { Spaceship } from '@starwards/model';

const MAP_SIZE = 20;
export const map = Array(10).fill(null).map(() => new Asteroid(
    nanoid(),
    new Vec2( Math.random() * MAP_SIZE, Math.random() * MAP_SIZE)
));
map.push(new Spaceship(
    nanoid(),
    new Vec2( Math.random() * MAP_SIZE, Math.random() * MAP_SIZE)
));
