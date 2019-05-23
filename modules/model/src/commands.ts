import { SpaceObjectBase } from './space-object-base';
import { XY } from './vec2';
// TODO: generify
export interface ChangeTurnSpeed {
    type: 'ChangeTurnSpeed';
    id: SpaceObjectBase['id'];
    delta: number;
}
export interface SetTurnSpeed {
    type: 'SetTurnSpeed';
    id: SpaceObjectBase['id'];
    value: number;
}
export interface ChangeVelocity {
    type: 'ChangeVelocity';
    id: SpaceObjectBase['id'];
    delta: XY;
}
export interface SetVelocity {
    type: 'SetVelocity';
    id: SpaceObjectBase['id'];
    value: XY;
}
export function isChangeTurnSpeed(c: SpaceCommand): c is ChangeTurnSpeed {
    return c.type === 'ChangeTurnSpeed';
}
export function isSetTurnSpeed(c: SpaceCommand): c is SetTurnSpeed {
    return c.type === 'SetTurnSpeed';
}
export function isChangeVelocity(c: SpaceCommand): c is ChangeVelocity {
    return c.type === 'ChangeVelocity';
}
export function isSetVelocity(c: SpaceCommand): c is SetVelocity {
    return c.type === 'SetVelocity';
}
export type SpaceCommand = ChangeTurnSpeed | SetTurnSpeed | ChangeVelocity | SetVelocity;
