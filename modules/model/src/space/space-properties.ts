import { BotOrder, SpaceObjectBase, XY } from '..';
import { PropertyCommand, SpaceObjectProperty } from '../api/property-constructors';

import { SpaceState } from '.';

export type BulkMoveArg = {
    ids: Array<SpaceObjectBase['id']>;
    delta: XY;
};
export const bulkMove = PropertyCommand('bulkMove', (state: SpaceState, value: BulkMoveArg) => {
    state.moveCommands.push(value);
});

export type BulkRotateArg = {
    ids: Array<SpaceObjectBase['id']>;
    delta: number;
};
export const bulkRotate = PropertyCommand('bulkRotate', (state: SpaceState, value: BulkRotateArg) => {
    for (const id of value.ids) {
        const subject = state.get(id);
        if (subject && !subject.destroyed) {
            subject.angle = (360 + subject.angle + value.delta) % 360;
        }
    }
});

export type BulkFreezeToggleArg = {
    ids: Array<SpaceObjectBase['id']>;
};
export const bulkFreezeToggle = PropertyCommand('bulkFreezeToggle', (state: SpaceState, value: BulkFreezeToggleArg) => {
    const allObjects = state.getBatch(value.ids);
    const isAllFrozen = allObjects.every((so) => so.freeze);
    for (const subject of allObjects) {
        subject.freeze = !isAllFrozen;
    }
});

export type BulkBotOrderArg = {
    ids: Array<SpaceObjectBase['id']>;
    order: BotOrder;
};
export const bulkBotOrder = PropertyCommand('bulkBotOrder', (state: SpaceState, value: BulkBotOrderArg) => {
    state.botOrderCommands.push(value);
});

export const freeze = SpaceObjectProperty<boolean>(`/freeze`);
