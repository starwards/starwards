import { Spaceship } from './spaceship';
import { Asteroid } from './asteroid';
import { Missile } from './missile';
export interface SpaceObjects {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
    Missile: Missile;
}

export type SpaceObject = SpaceObjects[keyof SpaceObjects];

export * from './asteroid';
export * from './space-object-base';
export * from './spaceship';
export * from './missile';
export * from './vec2';
export * from './sectors';
export * from './commands';
export * from './space-state';
