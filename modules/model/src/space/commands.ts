import { SpaceObjectBase } from './space-object-base';
import { XY } from './vec2';
export interface SpaceCommands {
    ChangeTurnSpeed: {
        id: SpaceObjectBase['id'];
        delta: number;
    };
    SetTurnSpeed: {
        id: SpaceObjectBase['id'];
        value: number;
    };
    ChangeVelocity: {
        id: SpaceObjectBase['id'];
        delta: XY;
    };
    SetVelocity: {
        id: SpaceObjectBase['id'];
        value: XY;
    };
    MoveObjects: {
        ids: Array<SpaceObjectBase['id']>;
        delta: XY;
    };
}

export type SpaceCommand = SpaceCommands[keyof SpaceCommands];
