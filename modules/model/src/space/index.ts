import { Spaceship } from './spaceship';
import { Asteroid } from './asteroid';
import { CannonShell } from './cannon-shell';
import { Explosion } from './explosion';
export interface SpaceObjects {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
    CannonShell: CannonShell;
    Explosion: Explosion;
}

export type SpaceObject = SpaceObjects[keyof SpaceObjects];

export * from './space-manager';
export * from './asteroid';
export * from './space-object-base';
export * from './spaceship';
export * from './cannon-shell';
export * from './explosion';
export * from './vec2';
export * from './sectors';
export * from './commands';
export * from './space-state';
