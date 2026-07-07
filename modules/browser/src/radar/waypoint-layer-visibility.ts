import { SpaceObject, Waypoint } from '@starwards/core';

import { Callback } from '../property-wrappers';

interface SpaceState {
    [Symbol.iterator](): Iterator<SpaceObject>;
}

export class WaypointLayerVisibility {
    private visible = new Map<string, boolean>();
    private callbacks: Callback[] = [];

    isVisible(collection: string): boolean {
        return this.visible.get(collection) ?? true;
    }

    setVisible(collection: string, visible: boolean): void {
        const prev = this.isVisible(collection);
        this.visible.set(collection, visible);
        if (prev !== visible) {
            this.notify();
        }
    }

    toggle(collection: string): void {
        this.setVisible(collection, !this.isVisible(collection));
    }

    update(state: SpaceState): void {
        let changed = false;
        for (const obj of state) {
            if (Waypoint.isInstance(obj) && !this.visible.has(obj.collection)) {
                this.visible.set(obj.collection, true);
                changed = true;
            }
        }
        if (changed) {
            this.notify();
        }
    }

    onChange(cb: Callback): () => void {
        this.callbacks.push(cb);
        return () => {
            const idx = this.callbacks.indexOf(cb);
            if (idx !== -1) this.callbacks.splice(idx, 1);
        };
    }

    private notify(): void {
        for (const cb of this.callbacks) {
            cb();
        }
    }
}
