import { Add, Remove } from 'colyseus-events';
import { Body, System } from 'detect-collisions';
import { SpaceObject, TrackableObjects, XY } from '@starwards/core';

const indexes = new WeakMap<TrackableObjects, SpatialIndex>();
export function getSpatialIndex(context: TrackableObjects): SpatialIndex {
    let index = indexes.get(context);
    if (index) {
        return index;
    }
    index = new SpatialIndex(context);
    indexes.set(context, index);
    return index;
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
