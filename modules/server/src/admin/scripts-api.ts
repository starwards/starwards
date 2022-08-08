import { Bot, SpaceObject, Spaceship } from '@starwards/core';

export interface ShipApi {
    setTarget(id: string | null): void;
    bot: Bot | null;
    spaceObject: Spaceship;
}
export interface GameApi {
    getShip(shipId: string): ShipApi | undefined;
    addObject(object: Exclude<SpaceObject, Spaceship>): void;
    addSpaceship(ship: Spaceship): ShipApi;
    stopGame(): void;
}
export interface GameMap {
    name: string;
    init: (game: GameApi) => void;
    update?: (deltaseconds: number) => void;
}
