import { GameRoom, SpaceObject, cmdSender, spaceProperties } from '@starwards/model';

import { SelectionContainer } from '../radar/selection-container';

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const spaceDriver = {
        get state() {
            return spaceRoom.state;
        },
        waitForObjecr(id: string): Promise<SpaceObject> {
            const tracked = spaceDriver.state.get(id);
            if (tracked) {
                return Promise.resolve(tracked);
            } else {
                return new Promise((res) => {
                    const tracker = (spaceObject: SpaceObject) => {
                        if (spaceObject.id === id) {
                            spaceDriver.state.events.removeListener('add', tracker);
                            res(spaceObject);
                        }
                    };
                    spaceDriver.state.events.addListener('add', tracker);
                });
            }
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
