import { GameRoom, cmdSender, spaceProperties } from '@starwards/model';

import { SelectionContainer } from '../radar/selection-container';

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const spaceDriver = {
        get state() {
            return spaceRoom.state;
        },
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.moveObjects),
        commandRotateObjects: cmdSender(spaceRoom, spaceProperties.rotateObjects),
        commandToggleFreeze: cmdSender(spaceRoom, spaceProperties.toggleFreeze),
        selectionActions(selectionContainer: SelectionContainer) {
            return {
                rotate: {
                    onChange: (delta: number) =>
                        spaceDriver.commandRotateObjects({
                            ids: selectionContainer.selectedItemsIds,
                            delta,
                        }),
                },
                toggleFreeze: {
                    onChange: (v: boolean) =>
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
