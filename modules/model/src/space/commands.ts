import { SpaceObjectBase } from './space-object-base';
import { XY } from './vec2';
export interface SpaceCommands {
    ChangeTurnSpeed: {
        type: 'ChangeTurnSpeed';
        id: SpaceObjectBase['id'];
        delta: number;
    };
    SetTurnSpeed: {
        type: 'SetTurnSpeed';
        id: SpaceObjectBase['id'];
        value: number;
    };
    ChangeVelocity: {
        type: 'ChangeVelocity';
        id: SpaceObjectBase['id'];
        delta: XY;
    };
    SetVelocity: {
        type: 'SetVelocity';
        id: SpaceObjectBase['id'];
        value: XY;
    };
    MoveObjects: {
        type: 'MoveObjects';
        ids: Array<SpaceObjectBase['id']>;
        delta: XY;
    };
}

export function isSpaceCommand<T extends keyof SpaceCommands>(
    type: T,
    command: SpaceCommand
): command is SpaceCommands[T] {
    return command.type === type;
}

export type SpaceCommand = SpaceCommands[keyof SpaceCommands];
