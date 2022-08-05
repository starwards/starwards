import { Add, Event, Remove } from 'colyseus-events';
import { Body, System } from 'detect-collisions';
import { GameRoom, getJsonPointer, makeOnChange } from '..';
import { SpaceEventEmitter, makeSpaceEventsEmitter } from './events';
import { SpaceObject, SpaceState, spaceProperties } from '../space';

import { XY } from '../logic';
import { cmdSender } from '../api';
import { noop } from 'ts-essentials';
import { pointerStrToObjectCommand } from '../space/space-properties';

export type SpaceDriver = ReturnType<typeof SpaceDriver>;

export type TrackableObjects = {
    events: SpaceEventEmitter;
    get(id: string): SpaceObject | undefined;
} & Iterable<SpaceObject>;
export class TrackObjects<C> {
    public contexts = new Map<string, C>();
    constructor(
        private objects: TrackableObjects,
        private createCtx: (object: SpaceObject) => C,
        private updateCtx: (object: SpaceObject, ctx: C) => void,
        private destroyCtx: (ctx: C) => void = noop,
        private shouldTrack = (_object: SpaceObject) => true
    ) {
        objects.events.on('$remove', (event: Remove) => this.stopTracking(event.path.split('/')[2]));
    }

    private stopTracking = (id: string) => {
        const context = this.contexts.get(id);
        if (context) {
            this.contexts.delete(id);
            this.destroyCtx(context);
        }
    };

    public update = () => {
        for (const object of this.objects) {
            if (this.shouldTrack(object)) {
                const context = this.contexts.get(object.id);
                if (context) {
                    this.updateCtx(object, context);
                } else {
                    this.contexts.set(object.id, this.createCtx(object));
                }
            } else {
                this.stopTracking(object.id);
            }
        }
    };

    public values() {
        return this.contexts.values();
    }
}

export class SpatialIndex {
    private collisions = new System(1);
    private collisionToId = new WeakMap<Body, string>();
    private stateToCollisions = new Map<string, Body>();
    private cleanups = new Map<string, () => void>();

    private createBody = (o: SpaceObject) => {
        const { id, type } = o;
        const body = this.collisions.createCircle(XY.clone(o.position), o.radius);
        this.collisionToId.set(body, id);
        this.stateToCollisions.set(id, body);
        const update = () => {
            body.r = o.radius; // order matters!
            body.setPosition(o.position.x, o.position.y); // this call implicitly updates the collision body
        };
        this.cleanups.set(id, () => {
            this.spaceDriver.events.off(`/${type}/${id}/position/x`, update);
            this.spaceDriver.events.off(`/${type}/${id}/position/y`, update);
            this.spaceDriver.events.off(`/${type}/${id}/radius`, update);
            this.stateToCollisions.delete(id);
            this.collisionToId.delete(body);
            this.collisions.remove(body);
            this.cleanups.delete(id);
        });
        this.spaceDriver.events.on(`/${type}/${id}/position/x`, update);
        this.spaceDriver.events.on(`/${type}/${id}/position/y`, update);
        this.spaceDriver.events.on(`/${type}/${id}/radius`, update);
        return body;
    };

    private destroyBody = (id: string) => this.cleanups.get(id)?.();

    constructor(private spaceDriver: TrackableObjects) {
        spaceDriver.events.on('$remove', (event: Remove) => this.destroyBody(event.path.split('/')[2]));
        spaceDriver.events.on('$add', (event: Add) => this.createBody(event.value as SpaceObject));
    }

    *selectPotentials(area: Body): Generator<SpaceObject> {
        for (const potential of this.collisions.getPotentials(area)) {
            const id = this.collisionToId.get(potential);
            const object = id && this.spaceDriver.get(id);
            if (object && !object.destroyed) {
                yield object;
            }
        }
    }
}

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const events = makeSpaceEventsEmitter(spaceRoom.state);
    const objectsApi = new ObjectsApi(spaceRoom, events);
    const coreDriver: TrackableObjects = {
        events,
        [Symbol.iterator]() {
            return spaceRoom.state[Symbol.iterator]();
        },
        get(id: string) {
            return spaceRoom.state.get(id);
        },
    };
    const spaceDriver = {
        ...coreDriver,
        spatial: new SpatialIndex(coreDriver),
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
            freeze: this.makeObjectProperty<boolean>(subject, '/freeze'),
        };
    }

    private makeObjectProperty<T>(subject: SpaceObject, pointerStr: string) {
        const pointer = getJsonPointer(pointerStr);
        if (!pointer) {
            throw new Error(`Illegal json path:${pointerStr}`);
        }
        const getValue = () => pointer.get(subject) as T;
        const cmdName = pointerStrToObjectCommand(pointerStr);
        return {
            getValue,
            onChange: makeOnChange(getValue, this.events, `/${subject.type}/${subject.id}${pointerStr}`),
            setValue: cmdSender<T, 'space', string>(this.spaceRoom, { cmdName }, subject.id),
        };
    }
}
