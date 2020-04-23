import { Schema } from '@colyseus/schema';
import { SpaceState, SpaceCommand } from './space';
import { AdminState, AdminCommand } from './admin';
export interface RoomApi<S extends Schema, C> {
    state: S;
    commands: C;
}
export interface Rooms {
    space: RoomApi<SpaceState, SpaceCommand>;
    admin: RoomApi<AdminState, AdminCommand>;
}
export function initClient<T extends keyof Rooms>(roomName: T, state: Rooms[T]['state']) {
    (clientInitFunctions[roomName] as (state: Rooms[T]['state']) => void)(state);
}
const clientInitFunctions: { [T in keyof Rooms]: (state: Rooms[T]['state']) => void } = {
    space: SpaceState.clientInit,
    admin: () => undefined,
};

export * from './space';
export * from './admin';
