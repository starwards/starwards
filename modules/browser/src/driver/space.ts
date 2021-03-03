import { GameRoom, cmdSender, spaceProperties } from '@starwards/model/src';

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    return {
        state: spaceRoom.state,
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.moveObjects),
    };
}
