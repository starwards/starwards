import { DeepReadonly } from 'ts-essentials';
import { ShipState } from './ship/ship-state';
import { SpaceObject } from './space';
import { Spaceship } from './space/spaceship';

export interface NpcShipApi {
    readonly isPlayerShip: false;
    readonly state: ShipState;
    setTarget(id: string | null): void;
    readonly spaceObject: DeepReadonly<Spaceship>;
}
export interface PcShipApi {
    readonly isPlayerShip: true;
    readonly state: ShipState;
    setTarget(id: string | null): void;
    readonly spaceObject: DeepReadonly<Spaceship>;
}
export type ShipApi = PcShipApi | NpcShipApi;
export interface GameApi {
    getShip(shipId: string): ShipApi | undefined;
    addObject(object: Exclude<SpaceObject, Spaceship>): void;
    addPlayerSpaceship(ship: Spaceship): PcShipApi;
    addNpcSpaceship(ship: Spaceship): NpcShipApi;
    stopGame(): void;
}
export interface GameMap {
    name: string;
    init: (game: GameApi) => void;
    update?: (deltaseconds: number) => void;
}
