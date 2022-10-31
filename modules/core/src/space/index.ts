import * as _spaceProperties from './space-properties';

import { Asteroid } from './asteroid';
import { Explosion } from './explosion';
import { Projectile } from './projectile';
import { Spaceship } from './spaceship';

export interface SpaceObjects {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
    Projectile: Projectile;
    Explosion: Explosion;
}

export type SpaceObject = SpaceObjects[keyof SpaceObjects];

export * from './asteroid';
export * from './space-object-base';
export * from './spaceship';
export * from './projectile';
export * from './explosion';
export * from './vec2';
export * from './sectors';
export * from './space-state';
export * from './faction';

export const spaceProperties = _spaceProperties;
