import { GameRoom, SpaceObject, SpaceState, cmdSender, spaceProperties } from '@starwards/model';
import { addEventsApi, wrapStateProperty } from './utils';

import EventEmitter from 'eventemitter3';
import { SelectionContainer } from '../radar/selection-container';

export type SpaceDriver = ReturnType<typeof SpaceDriver>;

function wireEvents(state: SpaceState) {
    const events = new EventEmitter();
    const collections = [state.cannonShells, state.asteroids, state.spaceships, state.explosions];
    const onAdd = (so: SpaceObject) => events.emit('add', so);
    const onRemove = (so: SpaceObject) => events.emit('remove', so);
    for (const c of collections) {
        c.onAdd = onAdd;
        c.onRemove = onRemove;
    }
    events.on('add', (so: SpaceObject) => {
        so.onChange = (changes) => {
            if (so.destroyed) {
                onRemove(so);
            }
            for (const { field } of changes) {
                events.emit(so.id, field); // old event format
                events.emit(so.id + '.' + field); // new event format
            }
        };
        so.position.onChange = (_) => events.emit(so.id, 'position');
        so.velocity.onChange = (_) => events.emit(so.id, 'velocity');
    });
    return events;
}

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const events = wireEvents(spaceRoom.state);

    const spaceDriver = {
        events,
        get state(): SpaceState {
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
                            events.removeListener('add', tracker);
                            res(spaceObject);
                        }
                    };
                    events.addListener('add', tracker);
                });
            }
        },
        getObjectApi(id: string) {
            return {
                id,
                freeze: addEventsApi(wrapStateProperty(spaceRoom, spaceProperties.freeze, id), events, `${id}.freeze`),
            };
        },
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.moveObjects, undefined),
        commandRotateObjects: cmdSender(spaceRoom, spaceProperties.rotateObjects, undefined),
        commandToggleFreeze: cmdSender(spaceRoom, spaceProperties.toggleFreeze, undefined),
        commandBotOrder: cmdSender(spaceRoom, spaceProperties.botOrder, undefined),
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
