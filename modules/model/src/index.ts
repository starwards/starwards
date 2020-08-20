import { Schema } from '@colyseus/schema';
import { AdminCommands, AdminState } from './admin';
import { SpaceCommands, SpaceState } from './space';
import { ShipState, ShipCommands } from './ship';
export interface RoomApi<S extends Schema, C> {
    state: S;
    commands: C;
}
export interface Rooms {
    space: RoomApi<SpaceState, SpaceCommands>;
    admin: RoomApi<AdminState, AdminCommands>;
    ship: RoomApi<ShipState, ShipCommands>;
}

export const schemaClasses = {
    space: SpaceState,
    admin: AdminState,
    ship: ShipState,
};

export * from './admin';
export * from './space';
export * from './ship';
export * from './formulas';
export * from './pilot-assist';
