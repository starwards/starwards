import { Add, Event, Remove } from 'colyseus-events';
import { Body, System } from 'detect-collisions';
import { SpaceObject, SpaceState, spaceProperties } from '../space';
import { addEventsApi, wrapStateProperty } from './utils';

import EventEmitter from 'eventemitter3';
import { GameRoom } from '..';
import { XY } from '../logic';
import { cmdSender } from '../api';
import { noop } from 'ts-essentials';
import { wireEvents } from './events';

export type SpaceDriver = ReturnType<typeof SpaceDriver>;

export type TrackableObjects = {
    events: EventEmitter;
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
        objects.events.on('/$remove', (event: Remove) => this.stopTracking(event.path.split('/')[1]));
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
    private stateToUpdate = new Map<string, () => void>();

    private createBody = (o: SpaceObject) => {
        const { id } = o;
        const body = this.collisions.createCircle(XY.clone(o.position), o.radius);
        this.collisionToId.set(body, id);
        this.stateToCollisions.set(id, body);
        const update = () => {
            body.r = o.radius; // order matters!
            body.setPosition(o.position.x, o.position.y); // this call implicitly updates the collision body
        };
        this.stateToUpdate.set(id, update);
        this.spaceDriver.events.on(`/${id}/position`, update);
        this.spaceDriver.events.on(`/${id}/radius`, update);
        return body;
    };

    private destroyBody = (id: string) => {
        const body = this.stateToCollisions.get(id);
        if (body) {
            const update = this.stateToUpdate.get(id);
            this.spaceDriver.events.off(`/${id}/position`, update);
            this.spaceDriver.events.off(`/${id}/radius`, update);
            this.stateToCollisions.delete(id);
            this.stateToUpdate.delete(id);
            this.collisionToId.delete(body);
            this.collisions.remove(body);
        }
    };
    constructor(private spaceDriver: TrackableObjects) {
        spaceDriver.events.on('/$remove', (event: Remove) => this.destroyBody(event.path.split('/')[1]));
        spaceDriver.events.on('/$add', (event: Add) => this.createBody(event.value as SpaceObject));
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
    const events = wireEvents(spaceRoom.state, new EventEmitter());
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
                            events.removeListener('/' + id, tracker);
                            res(event.value as SpaceObject);
                        }
                    };
                    events.addListener('/' + id, tracker);
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
    constructor(private spaceRoom: GameRoom<'space'>, private events: EventEmitter) {}
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
            freeze: addEventsApi(
                wrapStateProperty(this.spaceRoom, spaceProperties.freeze, subject.id),
                this.events,
                `/${subject.id}/freeze`
            ),
        };
    }
}
