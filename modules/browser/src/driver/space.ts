import { GameRoom, cmdSender, spaceProperties } from '@starwards/model/src';

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    return {
        get state() {
            return spaceRoom.state;
        },
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.moveObjects),
    };
}
