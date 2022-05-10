import { SpaceObject, SpaceState } from '@starwards/model';

export class TrackObjects<C> {
    public contexts = new Map<string, C>();
    constructor(
        private spaceState: SpaceState,
        private createCtx: (object: SpaceObject) => C,
        private updateCtx: (object: SpaceObject, ctx: C) => void,
        private destroyCtx: (ctx: C) => void,
        private shouldTrack = (_object: SpaceObject) => true
    ) {
        spaceState.events.on('remove', this.stopTracking);
    }

    private stopTracking = (destroyed: SpaceObject) => {
        const context = this.contexts.get(destroyed.id);
        if (context) {
            this.contexts.delete(destroyed.id);
            this.destroyCtx(context);
        }
    };

    public update = () => {
        for (const object of this.spaceState) {
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