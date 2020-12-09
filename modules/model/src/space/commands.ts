import { SpaceObjectBase } from './space-object-base';
import { XY } from '../logic/xy';
export interface SpaceCommands {
    moveObjects: {
        ids: Array<SpaceObjectBase['id']>;
        delta: XY;
    };
}

export type SpaceCommand = SpaceCommands[keyof SpaceCommands];
