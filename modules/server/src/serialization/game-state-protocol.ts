import { MapSchema, Schema } from '@colyseus/schema';
import { ShipState, SpaceState, gameField } from '@starwards/core';

/**
 * this class is designed to serialize and de-serialize game state
 */
class GameStateFragment extends Schema {
    @gameField({ map: ShipState })
    public ship = new MapSchema<ShipState>();

    @gameField(SpaceState)
    public space = new SpaceState();
}

export class SavedGame extends Schema {
    @gameField('string')
    public mapName = '';

    @gameField(GameStateFragment)
    public fragment = new GameStateFragment();
}
