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
export type State<R extends RoomName> = typeof schemaClasses[R]['prototype'];
export interface Stateful<S extends Schema> {
    state: S;
}
export interface GameRoom<R extends RoomName> extends Stateful<State<R>> {
    send(type: string, message: unknown): void;
}

export * from './admin';
export * from './api';
export * from './id';
export * from './logic';
export * from './ship';
export * from './space';
export * from './utils';
