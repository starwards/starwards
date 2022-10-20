import { GameRoom, readWriteProp } from '..';
import { SpaceEventEmitter, makeSpaceEventsEmitter } from './events';
import { SpaceObject, SpaceState, spaceProperties } from '../space';

import { Event } from 'colyseus-events';
import { cmdSender } from '../api';

export type SpaceDriver = ReturnType<typeof SpaceDriver>;

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const events = makeSpaceEventsEmitter(spaceRoom.state);
    const objectsApi = new ObjectsApi(spaceRoom, events);
    const spaceDriver = {
        events,
        [Symbol.iterator]() {
            return spaceRoom.state[Symbol.iterator]();
        },
        get(id: string) {
            return spaceRoom.state.get(id);
        },
        get state(): SpaceState {
            return spaceRoom.state;
        },
        waitForObject(id: string): Promise<SpaceObject> {
            const tracked = spaceDriver.state.get(id);
            if (tracked) {
                return Promise.resolve(tracked);
            } else {
                return new Promise((res) => {
                    const tracker = (event: Event) => {
                        if (event.op === 'add') {
                            events.off('/' + id, tracker);
                            res(event.value as SpaceObject);
                        }
                    };
                    events.on('/' + id, tracker);
                });
            }
        },
        getObjectApi: objectsApi.getObjectApi,
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.bulkMove, undefined),
        commandRotateObjects: cmdSender(spaceRoom, spaceProperties.bulkRotate, undefined),
        commandToggleFreeze: cmdSender(spaceRoom, spaceProperties.bulkFreezeToggle, undefined),
        commandBotOrder: cmdSender(spaceRoom, spaceProperties.bulkBotOrder, undefined),
        selectionActions(ids: () => string[]) {
            return {
                rotate: {
                    setValue: (delta: number) =>
                        spaceDriver.commandRotateObjects({
                            ids: ids(),
                            delta,
                        }),
                },
                toggleFreeze: {
                    setValue: (v: boolean) =>
                        v &&
                        spaceDriver.commandToggleFreeze({
                            ids: ids(),
                        }),
                },
            };
        },
    };
    return spaceDriver;
}

type ObjectApi = ReturnType<ObjectsApi['makeObjectApi']>;
class ObjectsApi {
    private cache = new WeakMap<SpaceObject, ObjectApi>();
    constructor(private spaceRoom: GameRoom<'space'>, private events: SpaceEventEmitter) {}
    getObjectApi = (subject: SpaceObject) => {
        const result = this.cache.get(subject);
        if (result) {
            return result;
        } else {
            const newApi = this.makeObjectApi(subject);
            this.cache.set(subject, newApi);
            return newApi;
        }
    };
    private makeObjectApi(subject: SpaceObject) {
        return {
            id: subject.id,
            freeze: readWriteProp(this.spaceRoom, this.events, `/${subject.type}/${subject.id}/freeze`),
        };
    }
}
