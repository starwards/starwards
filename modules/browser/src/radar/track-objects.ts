import { SpaceDriver, SpaceObject } from '@starwards/core';

import { Remove } from 'colyseus-events';
import { noop } from 'ts-essentials';

export class TrackObjects<C, T extends SpaceObject = SpaceObject> {
    public contexts = new Map<string, C>();
    constructor(
        private objects: SpaceDriver,
        private createCtx: (object: T) => C,
        private updateCtx: (object: T, ctx: C) => void,
        private destroyCtx: (ctx: C) => void = noop,
        private shouldTrack = (_o: SpaceObject): _o is T => true,
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
        for (const object of this.objects.state) {
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
