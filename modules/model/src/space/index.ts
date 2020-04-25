import { Spaceship } from './spaceship';
import { Asteroid } from './asteroid';
export interface SpaceObjects {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
}

export type SpaceObject = SpaceObjects[keyof SpaceObjects];

export * from './asteroid';
export * from './space-object-base';
export * from './space-state';
export * from './spaceship';
export * from './vec2';
export * from './sectors';
export * from './commands';
