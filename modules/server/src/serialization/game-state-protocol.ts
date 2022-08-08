import { MapSchema, Schema, type } from '@colyseus/schema';
import { ShipState, SpaceState } from '@starwards/core';

/**
 * this class is designed to serialize and de-serialize game state
 */
class GameStateFragment extends Schema {
    @type({ map: ShipState })
    public ship = new MapSchema<ShipState>();

    @type(SpaceState)
    public space = new SpaceState();
}

export class SavedGame extends Schema {
    @type('string')
    public mapName = '';

    @type(GameStateFragment)
    public fragment = new GameStateFragment();
}
