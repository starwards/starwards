
import { Asteroid } from '@starwards/model';
import { Vec2 } from '@starwards/model';
import nanoid from 'nanoid';
import { Spaceship } from '@starwards/model';

const fieldSize = 80000;
const asteroidSize = 25;
export const map = Array(1000).fill(null).map(() => new Asteroid(
    nanoid(),
    new Vec2( Math.random() * fieldSize - fieldSize / 2, Math.random() * fieldSize - fieldSize / 2),
    Math.random() * asteroidSize
));
map.push(new Spaceship(
    nanoid(),
    new Vec2( 0, 0),
    10
));
