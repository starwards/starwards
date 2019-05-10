
import { Spaceship } from './spaceship';
import { Asteroid } from './asteroid';

export interface Entities {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
}

export * from './asteroid';
export * from './space-object';
export * from './space-state';
export * from './spaceship';
export * from './vec2';
export * from './sectors';
