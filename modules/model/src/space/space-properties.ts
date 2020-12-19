import { SpaceObjectBase, XY } from '..';

import { PropertyCommand } from '../api/property-constructors';
import { SpaceState } from '.';

export type MoveObjectsArg = {
    ids: Array<SpaceObjectBase['id']>;
    delta: XY;
};

export const moveObjects = PropertyCommand<MoveObjectsArg, 'space'>(
    'moveObjects',
    (state: SpaceState, value: MoveObjectsArg) => {
        state.moveCommands.push(value);
    }
);
