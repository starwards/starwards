import { SpaceObjectBase, XY } from '..';

import { PropertyCommand } from '../api/property-constructors';
import { SpaceState } from '.';

export type MoveObjectsArg = {
    ids: Array<SpaceObjectBase['id']>;
    delta: XY;
};

export type RotataObjectsArg = {
    ids: Array<SpaceObjectBase['id']>;
    delta: number;
};

export type FreezeArg = {
    ids: Array<SpaceObjectBase['id']>;
};

export const moveObjects = PropertyCommand<MoveObjectsArg, 'space'>(
    'moveObjects',
    (state: SpaceState, value: MoveObjectsArg) => {
        state.moveCommands.push(value);
    }
);

export const rotateObjects = PropertyCommand<RotataObjectsArg, 'space'>(
    'rotateObjects',
    (state: SpaceState, value: RotataObjectsArg) => {
        state.rotateCommands.push(value);
    }
);

export const toggleFreeze = PropertyCommand<FreezeArg, 'space'>(
    'toggleFreeze',
    (state: SpaceState, value: FreezeArg) => {
        state.toggleFreezeCommand.push(...value.ids);
    }
);
