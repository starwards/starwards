import { MapSchema, Schema } from '@colyseus/schema';
import { ShipState } from '../ship';
import { SpaceState } from '../space';
import { gameField } from '../game-field';

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
