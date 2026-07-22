import { createWaypointVisibilityStore } from '../src/radar/waypoint-visibility-store';

describe('createWaypointVisibilityStore', () => {
    test('unknown collections default to visible', () => {
        const store = createWaypointVisibilityStore();
        expect(store.isVisible('route')).toBe(true);
        expect(store.isVisible('')).toBe(true);
    });

    test('setVisible(false) hides a collection, setVisible(true) shows it again', () => {
        const store = createWaypointVisibilityStore();
        store.setVisible('route', false);
        expect(store.isVisible('route')).toBe(false);
        store.setVisible('route', true);
        expect(store.isVisible('route')).toBe(true);
    });

    test('toggle flips visibility', () => {
        const store = createWaypointVisibilityStore();
        store.toggle('route');
        expect(store.isVisible('route')).toBe(false);
        store.toggle('route');
        expect(store.isVisible('route')).toBe(true);
    });

    test('changes to one collection do not affect others', () => {
        const store = createWaypointVisibilityStore();
        store.setVisible('route', false);
        expect(store.isVisible('mission')).toBe(true);
    });

    test('onChange fires only when visibility actually changes', () => {
        const store = createWaypointVisibilityStore();
        const cb = jest.fn();
        const unsub = store.onChange(cb);

        store.setVisible('route', false);
        expect(cb).toHaveBeenCalledTimes(1);

        store.setVisible('route', false); // no-op, already hidden
        expect(cb).toHaveBeenCalledTimes(1);

        store.toggle('route');
        expect(cb).toHaveBeenCalledTimes(2);

        unsub();
        store.toggle('route');
        expect(cb).toHaveBeenCalledTimes(2);
    });
});
