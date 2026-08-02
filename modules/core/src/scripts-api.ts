import { DeepReadonly } from 'ts-essentials';
import { ShipState } from './ship/ship-state';
import { SpaceObject } from './space';
import { Spaceship } from './space/spaceship';
import type { XY } from './logic';

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

    /**
     * Orders an NPC ship to attack a target. Picked up by `AutomationManager` on the
     * following tick, the same channel the GM's bot-order UI uses. Player ships ignore
     * orders by design.
     */
    orderAttack(shipId: string, targetId: string): void;
    /**
     * Orders an NPC ship to move to a position. Picked up by `AutomationManager` on the
     * following tick. Player ships ignore orders by design.
     */
    orderMove(shipId: string, position: XY): void;
    /**
     * Orders an NPC ship to follow another object. Picked up by `AutomationManager` on the
     * following tick. Player ships ignore orders by design.
     */
    orderFollow(shipId: string, targetId: string): void;
    /**
     * Clears any pending order for a ship. Picked up by `AutomationManager` on the
     * following tick. Player ships ignore orders by design.
     */
    orderNone(shipId: string): void;

    /** Read-only lookup of a space object by id, or `undefined` if it doesn't (or no longer) exist. */
    getObject(id: string): DeepReadonly<SpaceObject> | undefined;
    /** Read-only iteration over every space object currently in the game. */
    getObjects(): Iterable<DeepReadonly<SpaceObject>>;

    /**
     * Sets the global time-scale multiplier (`AdminState.speed`), clamped to its declared
     * `[0, 3]` range. `0` pauses the simulation; `GameMap.update` keeps firing while paused
     * (see its JSDoc).
     */
    setSpeed(speed: number): void;
    /** Sets the free-text scenario/GM announcement, broadcast to every screen via `AdminState`. */
    setMessage(message: string): void;
}
export interface GameMap {
    name: string;
    init: (game: GameApi) => void;
    /**
     * Called every tick while the game is running, including while paused (`speed === 0`) —
     * in that case `deltaseconds` is `0`, but the call still fires so queued commands keep
     * draining. Gate any time-accumulating script logic on `deltaseconds > 0`.
     */
    update?: (deltaseconds: number) => void;
}
