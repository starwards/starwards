import { AdminState } from './admin';
import { Schema } from '@colyseus/schema';
import { ShipState } from './ship';
import { SpaceState } from './space';

export const schemaClasses = {
    space: SpaceState,
    admin: AdminState,
    ship: ShipState,
};

export type RoomName = keyof typeof schemaClasses;
export type State<R extends RoomName> = (typeof schemaClasses)[R]['prototype'];
export interface Stateful<S extends Schema> {
    readonly state: S;
}
export interface GameRoom<R extends RoomName> extends Stateful<State<R>> {
    send(type: string, message: unknown): void;
}

export * from './admin';
export * from './async-utils';
export * from './client';
export * from './commands';
export * from './configurations';
export * from './events';
export * from './game-field';
export * from './id';
export * from './json-ptr';
export * from './logic';
export * from './range';
export * from './scripts-api';
export * from './ship';
export * from './space';
export * from './task-loop';
export * from './tweakable';
export * from './updateable';
export * from './utils';
