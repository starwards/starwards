import { Body, System } from 'detect-collisions';
import { GameRoom, SpaceObject, SpaceState, XY, cmdSender, spaceProperties } from '@starwards/model';
import { addEventsApi, wrapStateProperty } from './utils';

import EventEmitter from 'eventemitter3';
import { SelectionContainer } from '../radar/selection-container';
import { noop } from 'ts-essentials';

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
        so.position.onChange = (_) => {
            events.emit(so.id, 'position'); // old event format
            events.emit(so.id + '.position'); // new event format
        };
        so.velocity.onChange = (_) => {
            events.emit(so.id, 'velocity'); // old event format
            events.emit(so.id + '.velocity'); // new event format
        };
    });
    return events;
}
export type TrackableObjects = {
    events: EventEmitter;
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
        objects.events.on('remove', this.stopTracking);
    }

    private stopTracking = (destroyed: SpaceObject) => {
        const context = this.contexts.get(destroyed.id);
        if (context) {
            this.contexts.delete(destroyed.id);
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
                this.stopTracking(object);
            }
        }
    };

    public values() {
        return this.contexts.values();
    }
}

export class SpatialIndex {
    private collisions = new System(1);
    private collisionToState = new WeakMap<Body, SpaceObject>();
    private stateToCollisions = new WeakMap<SpaceObject, Body>();
    private stateToUpdate = new WeakMap<SpaceObject, () => void>();

    private createBody = (o: SpaceObject) => {
        const body = this.collisions.createCircle(XY.clone(o.position), o.radius);
        this.collisionToState.set(body, o);
        this.stateToCollisions.set(o, body);
        const update = () => {
            body.r = o.radius; // order matters!
            body.setPosition(o.position.x, o.position.y); // this call implicitly updates the collision body
        };
        this.stateToUpdate.set(o, update);
        this.spaceDriver.events.on(o.id + '.position', update);
        this.spaceDriver.events.on(o.id + '.radius', update);
        return body;
    };
    private destroyBody = (o: SpaceObject) => {
        const body = this.stateToCollisions.get(o);
        if (body) {
            const update = this.stateToUpdate.get(o);
            this.spaceDriver.events.off(o.id + '.position', update);
            this.spaceDriver.events.off(o.id + '.radius', update);
            this.stateToCollisions.delete(o);
            this.stateToUpdate.delete(o);
            this.collisionToState.delete(body);
            this.collisions.remove(body);
        }
    };
    constructor(private spaceDriver: TrackableObjects) {
        spaceDriver.events.on('remove', this.destroyBody);
        spaceDriver.events.on('add', this.createBody);
    }

    *selectPotentials(area: Body): Generator<SpaceObject> {
        for (const potential of this.collisions.getPotentials(area)) {
            // if (this.collisions.checkCollision(area, potential)) {
            const object = this.collisionToState.get(potential);
            if (object) {
                yield object;
            }
            // }
        }
    }
}

export function SpaceDriver(spaceRoom: GameRoom<'space'>) {
    const events = wireEvents(spaceRoom.state);
    const objectsApi = new ObjectsApi(spaceRoom, events);
    const spaceDriver = {
        events,
        spatial: new SpatialIndex({
            events,
            [Symbol.iterator]() {
                return spaceRoom.state[Symbol.iterator]();
            },
        }),
        [Symbol.iterator]() {
            return spaceRoom.state[Symbol.iterator]();
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
        getObjectApi: objectsApi.getObjectApi,
        commandMoveObjects: cmdSender(spaceRoom, spaceProperties.bulkMove, undefined),
        commandRotateObjects: cmdSender(spaceRoom, spaceProperties.bulkRotate, undefined),
        commandToggleFreeze: cmdSender(spaceRoom, spaceProperties.bulkFreezeToggle, undefined),
        commandBotOrder: cmdSender(spaceRoom, spaceProperties.bulkBotOrder, undefined),
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
                `${subject.id}.freeze`
            ),
        };
    }
}
