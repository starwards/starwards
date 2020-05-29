import { SpaceObjectBase } from './space-object-base';
import { XY } from './vec2';
export interface SpaceCommands {
    moveObjects: {
        ids: Array<SpaceObjectBase['id']>;
        delta: XY;
    };
}

export type SpaceCommand = SpaceCommands[keyof SpaceCommands];
