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

export const schemaClasses = {
    space: SpaceState,
    admin: AdminState,
};

export * from './admin';
export * from './space';
