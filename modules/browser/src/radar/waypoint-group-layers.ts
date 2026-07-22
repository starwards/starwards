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

export function ownWaypoints(spaceDriver: SpaceDriver, shipId: string): Waypoint[] {
    return [...spaceDriver.state.getAll('Waypoint')].filter((wp) => wp.owner === shipId && !wp.destroyed);
}

export function listOwnGroups(spaceDriver: SpaceDriver, shipId: string): string[] {
    return [...new Set(ownWaypoints(spaceDriver, shipId).map((wp) => wp.collection))].sort();
}

/**
 * Watches the ship's own waypoint groups (the waypoint `collection` field) and calls
 * `onGroupShown`/`onGroupHidden` as groups appear/empty. Backs `WaypointGroupLayers` below;
 * also used directly by consumers that don't need a dedicated radar layer per group.
 */
export function watchOwnWaypointGroups(
    spaceDriver: SpaceDriver,
    shipId: string,
    onGroupShown: (collection: string) => void,
    onGroupHidden: (collection: string) => void,
): Destructor {
    const activeGroups = new Set<string>();
    const collectionSubs = new Map<string, Destructor>();

    function recompute() {
        const groups = new Set(listOwnGroups(spaceDriver, shipId));
        for (const collection of groups) {
            if (!activeGroups.has(collection)) {
                activeGroups.add(collection);
                onGroupShown(collection);
            }
        }
        for (const collection of [...activeGroups]) {
            if (!groups.has(collection)) {
                activeGroups.delete(collection);
                onGroupHidden(collection);
            }
        }
    }

    function watchCollection(wpId: string) {
        if (collectionSubs.has(wpId)) return;
        const collectionProp = readProp<string>(spaceDriver, `/Waypoint/${wpId}/collection`);
        collectionSubs.set(wpId, collectionProp.onChange(recompute));
    }

    for (const wp of ownWaypoints(spaceDriver, shipId)) {
        watchCollection(wp.id);
    }

    const onAdd = (e: Add) => {
        const match = /^\/Waypoint\/([^/]+)$/.exec(e.path);
        if (!match) return;
        watchCollection(match[1]);
        recompute();
    };
    const onRemove = (e: Remove) => {
        const match = /^\/Waypoint\/([^/]+)$/.exec(e.path);
        if (!match) return;
        const unsub = collectionSubs.get(match[1]);
        if (unsub) {
            unsub();
            collectionSubs.delete(match[1]);
        }
        recompute();
    };

    spaceDriver.events.on('$add', onAdd);
    spaceDriver.events.on('$remove', onRemove);
    recompute();

    return () => {
        spaceDriver.events.off('$add', onAdd);
        spaceDriver.events.off('$remove', onRemove);
        for (const unsub of collectionSubs.values()) unsub();
        collectionSubs.clear();
    };
}

/**
 * Maintains one radar layer per waypoint group (the waypoint `collection` field) for the
 * ship's own waypoints. Layers are created when a group first appears; when a group empties
 * its layer stays (it renders nothing) but the panel is notified to drop its toggle.
 */
export class WaypointGroupLayers {
    private layers = new Map<string, ObjectsLayer<'Waypoint'>>();
    private unwatch: Destructor;

    constructor(
        private root: CameraView,
        private spaceDriver: SpaceDriver,
        private shipId: string,
        private selection: SelectionContainer,
        private onGroupShown: (name: string, layer: ObjectsLayer<'Waypoint'>, collection: string) => void,
        private onGroupHidden: (name: string, collection: string) => void,
    ) {
        this.unwatch = watchOwnWaypointGroups(
            spaceDriver,
            shipId,
            (collection) =>
                this.onGroupShown(groupDisplayName(collection), this.getOrCreateLayer(collection), collection),
            (collection) => this.onGroupHidden(groupDisplayName(collection), collection),
        );
    }

    destroy() {
        this.unwatch();
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
