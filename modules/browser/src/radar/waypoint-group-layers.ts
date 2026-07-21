import { Add, Remove } from 'colyseus-events';
import { Destructor, SpaceDriver, Waypoint } from '@starwards/core';

import { CameraView } from './camera-view';
import { ObjectsLayer } from './blips/objects-layer';
import { SelectionContainer } from './selection-container';
import { readProp } from '../property-wrappers';
import { tacticalDrawWaypoints } from './blips/blip-renderer';

export const DEFAULT_GROUP_NAME = 'waypoints';

export function groupDisplayName(collection: string) {
    return collection ? `waypoints: ${collection}` : DEFAULT_GROUP_NAME;
}

/**
 * Maintains one radar layer per waypoint group (the waypoint `collection` field) for the
 * ship's own waypoints. Layers are created when a group first appears; when a group empties
 * its layer stays (it renders nothing) but the panel is notified to drop its toggle.
 */
export class WaypointGroupLayers {
    private layers = new Map<string, ObjectsLayer<'Waypoint'>>();
    private activeGroups = new Set<string>();
    private collectionSubs = new Map<string, Destructor>();

    constructor(
        private root: CameraView,
        private spaceDriver: SpaceDriver,
        private shipId: string,
        private selection: SelectionContainer,
        private onGroupShown: (name: string, layer: ObjectsLayer<'Waypoint'>, collection: string) => void,
        private onGroupHidden: (name: string) => void,
    ) {
        for (const wp of this.ownWaypoints()) {
            this.watchCollection(wp.id);
        }
        spaceDriver.events.on('$add', this.onAdd);
        spaceDriver.events.on('$remove', this.onRemove);
        this.recompute();
    }

    destroy() {
        this.spaceDriver.events.off('$add', this.onAdd);
        this.spaceDriver.events.off('$remove', this.onRemove);
        for (const unsub of this.collectionSubs.values()) unsub();
        this.collectionSubs.clear();
    }

    private ownWaypoints(): Waypoint[] {
        return [...this.spaceDriver.state.getAll('Waypoint')].filter((wp) => wp.owner === this.shipId && !wp.destroyed);
    }

    private onAdd = (e: Add) => {
        const match = /^\/Waypoint\/([^/]+)$/.exec(e.path);
        if (!match) return;
        this.watchCollection(match[1]);
        this.recompute();
    };

    private onRemove = (e: Remove) => {
        const match = /^\/Waypoint\/([^/]+)$/.exec(e.path);
        if (!match) return;
        const unsub = this.collectionSubs.get(match[1]);
        if (unsub) {
            unsub();
            this.collectionSubs.delete(match[1]);
        }
        this.recompute();
    };

    private watchCollection(wpId: string) {
        if (this.collectionSubs.has(wpId)) return;
        const collectionProp = readProp<string>(this.spaceDriver, `/Waypoint/${wpId}/collection`);
        this.collectionSubs.set(
            wpId,
            collectionProp.onChange(() => this.recompute()),
        );
    }

    private recompute() {
        const groups = new Set<string>();
        for (const wp of this.ownWaypoints()) {
            groups.add(wp.collection);
        }
        for (const collection of groups) {
            if (!this.activeGroups.has(collection)) {
                this.activeGroups.add(collection);
                this.onGroupShown(groupDisplayName(collection), this.getOrCreateLayer(collection), collection);
            }
        }
        for (const collection of [...this.activeGroups]) {
            if (!groups.has(collection)) {
                this.activeGroups.delete(collection);
                this.onGroupHidden(groupDisplayName(collection));
            }
        }
    }

    private getOrCreateLayer(collection: string): ObjectsLayer<'Waypoint'> {
        const existing = this.layers.get(collection);
        if (existing) return existing;
        const layer = new ObjectsLayer(
            this.root,
            this.spaceDriver,
            32,
            (w: Waypoint) => w.color,
            tacticalDrawWaypoints,
            this.selection,
            (w: Waypoint) => w.owner === this.shipId && w.collection === collection,
        );
        this.layers.set(collection, layer);
        this.root.addLayer(layer.renderRoot);
        return layer;
    }
}
