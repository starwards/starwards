import { XY } from '../logic/xy';
import { SpaceObjectBase } from './space-object-base';
export interface SpaceCommands {
    moveObjects: {
        ids: Array<SpaceObjectBase['id']>;
        delta: XY;
    };
}

export type SpaceCommand = SpaceCommands[keyof SpaceCommands];
