import { SpaceObject, TrackableObjects } from '@starwards/core';

import { Remove } from 'colyseus-events';
import { noop } from 'ts-essentials';

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
