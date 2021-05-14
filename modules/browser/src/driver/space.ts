import { GameRoom, cmdSender, spaceProperties } from '@starwards/model';

import { SelectionContainer } from '../radar/selection-container';

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const spaceDriver = {
        get state() {
            return spaceRoom.state;
        },
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.moveObjects, undefined),
        commandRotateObjects: cmdSender(spaceRoom, spaceProperties.rotateObjects, undefined),
        commandToggleFreeze: cmdSender(spaceRoom, spaceProperties.toggleFreeze, undefined),
        selectionActions(selectionContainer: SelectionContainer) {
            return {
                rotate: {
                    setValue: (delta: number) =>
                        spaceDriver.commandRotateObjects({
                            ids: selectionContainer.selectedItemsIds,
                            delta,
                        }),
                },
                toggleFreeze: {
                    setValue: (v: boolean) =>
                        v &&
                        spaceDriver.commandToggleFreeze({
                            ids: selectionContainer.selectedItemsIds,
                        }),
                },
            };
        },
    };
    return spaceDriver;
}
