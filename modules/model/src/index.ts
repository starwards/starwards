
import { Spaceship } from './spaceship';
import { Asteroid } from './asteroid';
import { SpaceState } from './space-state';

export interface SpaceObjects {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
}

export type SpaceObject = SpaceObjects[keyof SpaceObjects];
export interface Rooms {
    'space': SpaceState;
}

export const clientInitFunctions: { [T in keyof Rooms]: (state: Rooms[T]) => void } = {
    space : SpaceState.clientInit
};

export * from './asteroid';
export * from './space-object-base';
export * from './space-state';
export * from './spaceship';
export * from './vec2';
export * from './sectors';
