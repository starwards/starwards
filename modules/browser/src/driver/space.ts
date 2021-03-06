import { GameRoom, cmdSender, spaceProperties } from '@starwards/model/src';

import { SelectionContainer } from '../radar/selection-container';

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const spaceDriver = {
        get state() {
            return spaceRoom.state;
        },
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.moveObjects),
        commandRotateObjects: cmdSender(spaceRoom, spaceProperties.rotateObjects),
        commandToggleZeroSpeed: cmdSender(spaceRoom, spaceProperties.toggleZeroSpeed),
        selectionActions(selectionContainer: SelectionContainer) {
            return {
                rotate: {
                    onChange: (delta: number) =>
                        spaceDriver.commandRotateObjects({
                            ids: selectionContainer.selectedItemsIds,
                            delta,
                        }),
                },
                toggleZeroSpeed: {
                    onChange: (v: boolean) =>
                        v &&
                        spaceDriver.commandToggleZeroSpeed({
                            ids: selectionContainer.selectedItemsIds,
                        }),
                },
            };
        },
    };
    return spaceDriver;
}
