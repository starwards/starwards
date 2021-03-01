import { GameRoom, cmdSender, spaceProperties } from '@starwards/model/src';

export type SpaceDriver = ReturnType<typeof makeSpaceDriver>;
export function makeSpaceDriver(spaceRoom: GameRoom<'space'>) {
    return {
        state: spaceRoom.state,
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.moveObjects),
    };
}
