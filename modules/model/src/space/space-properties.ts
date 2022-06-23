import { BotOrder, SpaceObjectBase, XY } from '..';
import { PropertyCommand, StatePropertyCommand } from '../api/property-constructors';

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

export type BotOrderArg = {
    ids: Array<SpaceObjectBase['id']>;
    order: BotOrder;
};

export const moveObjects = PropertyCommand('moveObjects', (state: SpaceState, value: MoveObjectsArg) => {
    state.moveCommands.push(value);
});

export const rotateObjects = PropertyCommand('rotateObjects', (state: SpaceState, value: RotataObjectsArg) => {
    state.rotateCommands.push(value);
});

export const toggleFreeze = PropertyCommand('toggleFreeze', (state: SpaceState, value: FreezeArg) => {
    state.toggleFreezeCommand.push(...value.ids);
});

export const botOrder = PropertyCommand('botOrder', (state: SpaceState, value: BotOrderArg) => {
    state.botOrderCommands.push(value);
});
export const freeze = StatePropertyCommand(
    'freeze',
    (state: SpaceState, value: boolean, id: string) => {
        const so = state.get(id);
        if (so) so.freeze = value;
    },
    (state: SpaceState, id: string) => state.get(id)?.freeze || false
);
