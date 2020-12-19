import { AdminState } from './admin';
import { Schema } from '@colyseus/schema';
import { ShipState } from './ship';
import { SpaceState } from './space';

export interface RoomApi<S extends Schema, C> {
    state: S;
    commands: C;
}
export interface Rooms {
    space: RoomApi<SpaceState, unknown>;
    admin: RoomApi<AdminState, unknown>;
    ship: RoomApi<ShipState, unknown>;
}

export const schemaClasses = {
    space: SpaceState,
    admin: AdminState,
    ship: ShipState,
};

export type RoomName = keyof Rooms;
export type Commands<T extends RoomName> = Rooms[T]['commands'];
export type CommandName<T extends RoomName> = keyof Commands<T>;
export type State<T extends RoomName> = Rooms[T]['state'];
export type NamedGameRoom<T extends RoomName> = GameRoom<State<T>, Commands<T>>;
export interface GameRoom<S, C> {
    state: S;
    send<T extends keyof C>(type: T, message: C[T]): void;
}

export * from './admin';
export * from './id';
export * from './logic';
export * from './ship';
export * from './space';
export * from './api';
