import { DeepReadonly } from 'ts-essentials';
import { ShipState } from './ship/ship-state';
import { SpaceObject } from './space';
import { Spaceship } from './space/spaceship';
import { XY } from './logic';

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
    /** Orders a bot-controlled ship to attack `targetId`. No-op on player ships. */
    orderAttack(shipId: string, targetId: string): void;
    /** Orders a bot-controlled ship to move to `position`. No-op on player ships. */
    orderMove(shipId: string, position: XY): void;
    /** Orders a bot-controlled ship to follow `targetId`. No-op on player ships. */
    orderFollow(shipId: string, targetId: string): void;
    /** Clears any pending bot order on the ship. No-op on player ships. */
    orderNone(shipId: string): void;
    /** Read-only lookup of a single space object, by id. */
    getObject(id: string): DeepReadonly<SpaceObject> | undefined;
    /** Read-only view of every live space object. */
    getObjects(): Iterable<DeepReadonly<SpaceObject>>;
    /** Sets the global time-scale multiplier (`AdminState.speed`), clamped to `[0, 3]`. `0` pauses the simulation. */
    setSpeed(speed: number): void;
    /** Sets the free-text scenario/GM announcement broadcast to every screen (`AdminState.message`). */
    setMessage(message: string): void;
}
export interface GameMap {
    name: string;
    init: (game: GameApi) => void;
    /**
     * Called every tick while the game is running, including while paused — `deltaseconds`
     * is `0` at `speed = 0` (queued commands must keep draining). Gate any accumulation of
     * time or advancement of scenario state on `deltaseconds > 0`.
     */
    update?: (deltaseconds: number) => void;
}
