import { AdminState } from './admin';
import { ShipState } from './ship';
import { SpaceState } from './space';

export const schemaClasses = {
    space: SpaceState,
    admin: AdminState,
    ship: ShipState,
};

export type RoomName = keyof typeof schemaClasses;
export type State<R extends RoomName> = typeof schemaClasses[R]['prototype'];
export interface Stateful<R extends RoomName> {
    state: State<R>;
}
export interface GameRoom<R extends RoomName> extends Stateful<R> {
    send(type: string, message: unknown): void;
}

export * from './admin';
export * from './api';
export * from './id';
export * from './logic';
export * from './ship';
export * from './space';
export { getConstant } from './utils';
