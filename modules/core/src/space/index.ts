import * as _spaceCommands from './space-commands';

import { Asteroid } from './asteroid';
import { Explosion } from './explosion';
import { Projectile } from './projectile';
import { Spaceship } from './spaceship';
import { Waypoint } from './waypoint';

export interface SpaceObjects {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
    Projectile: Projectile;
    Explosion: Explosion;
    Waypoint: Waypoint;
}

export type SpaceObject = SpaceObjects[keyof SpaceObjects];

export * from './asteroid';
export * from './space-object-base';
export * from './spaceship';
export * from './projectile';
export * from './explosion';
export * from './waypoint';
export * from './vec2';
export * from './sectors';
export * from './space-state';
export * from './faction';
export * from './scan-level';
export * from './space-commands';

export const spaceCommands = _spaceCommands;
