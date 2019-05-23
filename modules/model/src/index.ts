
import { Spaceship } from './spaceship';
import { Asteroid } from './asteroid';
import { SpaceState } from './space-state';
import { Schema } from '@colyseus/schema';
import { SpaceCommand } from './commands';

export interface SpaceObjects {
    Spaceship: Spaceship;
    Asteroid: Asteroid;
}

export type SpaceObject = SpaceObjects[keyof SpaceObjects];
export interface RoomApi<S extends Schema, C> {
    state: S;
    commands: C;
}
export interface Rooms {
    'space': RoomApi<SpaceState, SpaceCommand>;
}

export const clientInitFunctions: { [T in keyof Rooms]: (state: Rooms[T]['state']) => void } = {
    space : SpaceState.clientInit
};

export * from './asteroid';
export * from './space-object-base';
export * from './space-state';
export * from './spaceship';
export * from './vec2';
export * from './sectors';
export * from './commands';
