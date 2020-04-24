import { Schema } from '@colyseus/schema';
import { AdminCommands, AdminState } from './admin';
import { SpaceCommands, SpaceState } from './space';
export interface RoomApi<S extends Schema, C> {
    state: S;
    commands: C;
}
export interface Rooms {
    space: RoomApi<SpaceState, SpaceCommands>;
    admin: RoomApi<AdminState, AdminCommands>;
}
export function initClient<T extends keyof Rooms>(roomName: T, state: Rooms[T]['state']) {
    (clientInitFunctions[roomName] as (state: Rooms[T]['state']) => void)(state);
}
const clientInitFunctions: { [T in keyof Rooms]: (state: Rooms[T]['state']) => void } = {
    space: SpaceState.clientInit,
    admin: () => undefined,
};

export * from './admin';
export * from './space';
