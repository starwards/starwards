import { Waypoint } from '@starwards/core';
import { WaypointLayerVisibility } from '../src/radar/waypoint-layer-visibility';

function makeWaypoint(collection: string, id = 'w1'): Waypoint {
    const w = new Waypoint();
    w.id = id;
    w.collection = collection;
    return w;
}

function makeSpaceState(waypoints: Waypoint[]) {
    return {
        *[Symbol.iterator]() {
            yield* waypoints;
        },
    };
}

describe('WaypointLayerVisibility', () => {
    test('unknown collections default to visible', () => {
        const store = new WaypointLayerVisibility();
        expect(store.isVisible('mission')).toBe(true);
        expect(store.isVisible('')).toBe(true);
    });

    test('setVisible hides a collection', () => {
        const store = new WaypointLayerVisibility();
        store.setVisible('mission', false);
        expect(store.isVisible('mission')).toBe(false);
    });

    test('setVisible makes a collection visible again', () => {
        const store = new WaypointLayerVisibility();
        store.setVisible('mission', false);
        store.setVisible('mission', true);
        expect(store.isVisible('mission')).toBe(true);
    });

    test('toggle flips visibility', () => {
        const store = new WaypointLayerVisibility();
        store.toggle('mission');
        expect(store.isVisible('mission')).toBe(false);
        store.toggle('mission');
        expect(store.isVisible('mission')).toBe(true);
    });

    test('update discovers collections from space state', () => {
        const store = new WaypointLayerVisibility();
        const waypoints = [makeWaypoint('alpha', 'w1'), makeWaypoint('beta', 'w2')];
        store.update(makeSpaceState(waypoints));
        expect(store.isVisible('alpha')).toBe(true);
        expect(store.isVisible('beta')).toBe(true);
    });

    test('onChange fires when setVisible changes value', () => {
        const store = new WaypointLayerVisibility();
        const calls: boolean[] = [];
        store.onChange(() => calls.push(true));
        store.setVisible('mission', false);
        expect(calls.length).toBe(1);
    });

    test('onChange does not fire when value is unchanged', () => {
        const store = new WaypointLayerVisibility();
        const calls: boolean[] = [];
        store.onChange(() => calls.push(true));
        store.setVisible('mission', true); // already true (default)
        expect(calls.length).toBe(0);
    });

    test('onChange fires when update discovers a new collection', () => {
        const store = new WaypointLayerVisibility();
        const calls: boolean[] = [];
        store.onChange(() => calls.push(true));
        store.update(makeSpaceState([makeWaypoint('new-collection')]));
        expect(calls.length).toBe(1);
    });

    test('onChange does not fire when update finds no new collections', () => {
        const store = new WaypointLayerVisibility();
        const waypoints = [makeWaypoint('alpha')];
        store.update(makeSpaceState(waypoints));
        const calls: boolean[] = [];
        store.onChange(() => calls.push(true));
        store.update(makeSpaceState(waypoints)); // same collection
        expect(calls.length).toBe(0);
    });

    test('onChange cleanup unsubscribes', () => {
        const store = new WaypointLayerVisibility();
        const calls: boolean[] = [];
        const cleanup = store.onChange(() => calls.push(true));
        cleanup();
        store.setVisible('mission', false);
        expect(calls.length).toBe(0);
    });

    test('visibility filter returns false for hidden collection waypoints', () => {
        const store = new WaypointLayerVisibility();
        store.setVisible('secret', false);
        const w = makeWaypoint('secret');
        expect(store.isVisible(w.collection)).toBe(false);
        const w2 = makeWaypoint('public');
        expect(store.isVisible(w2.collection)).toBe(true);
    });
});
