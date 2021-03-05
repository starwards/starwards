import { GameRoom, cmdSender, spaceProperties } from '@starwards/model/src';

import { SelectionContainer } from '../radar/selection-container';

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const spaceDriver = {
        get state() {
            return spaceRoom.state;
        },
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.moveObjects),
        commandRotateObjects: cmdSender(spaceRoom, spaceProperties.rotateObjects),
        commandToggleLockObjects: cmdSender(spaceRoom, spaceProperties.toggleLockObjects),
        selectionActions(selectionContainer: SelectionContainer) {
            return {
                rotate: {
                    onChange: (delta: number) =>
                        spaceDriver.commandRotateObjects({
                            ids: selectionContainer.selectedItemsIds,
                            delta,
                        }),
                },
                toggleLockObjects: {
                    onChange: (v: boolean) =>
                        v &&
                        spaceDriver.commandToggleLockObjects({
                            ids: selectionContainer.selectedItemsIds,
                        }),
                },
            };
        },
    };
    return spaceDriver;
}
