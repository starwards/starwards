export type WaypointVisibilityStore = {
    isVisible(collection: string): boolean;
    setVisible(collection: string, visible: boolean): void;
    toggle(collection: string): void;
    onChange(cb: () => void): () => void;
};

/**
 * Client-side (not synced) store of which waypoint collections are hidden on a radar.
 * Unknown/new collections default to visible.
 */
export function createWaypointVisibilityStore(): WaypointVisibilityStore {
    const hidden = new Set<string>();
    const listeners = new Set<() => void>();
    const notify = () => {
        for (const cb of listeners) cb();
    };

    return {
        isVisible: (collection) => !hidden.has(collection),
        setVisible: (collection, visible) => {
            const changed = visible ? hidden.delete(collection) : !hidden.has(collection) && !!hidden.add(collection);
            if (changed) notify();
        },
        toggle: (collection) => {
            if (hidden.has(collection)) {
                hidden.delete(collection);
            } else {
                hidden.add(collection);
            }
            notify();
        },
        onChange: (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
    };
}
