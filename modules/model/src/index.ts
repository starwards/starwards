import { AdminCommands, AdminState } from './admin';
import { ShipCommands, ShipState, SmartPilotCommands } from './ship';
import { SpaceCommands, SpaceState } from './space';

import { Schema } from '@colyseus/schema';

export interface RoomApi<S extends Schema, C> {
    state: S;
    commands: C;
}
export interface Rooms {
    space: RoomApi<SpaceState, SpaceCommands>;
    admin: RoomApi<AdminState, AdminCommands>;
    ship: RoomApi<ShipState, ShipCommands & SmartPilotCommands>;
}

export const schemaClasses = {
    space: SpaceState,
    admin: AdminState,
    ship: ShipState,
};

export * from './admin';
export * from './space';
export * from './ship';
export * from './logic';
export * from './id';
