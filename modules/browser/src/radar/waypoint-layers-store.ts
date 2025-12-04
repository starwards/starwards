import EventEmitter from 'eventemitter3';
import { SpaceDriver, Waypoint } from '@starwards/core';

export type WaypointLayersStoreEvents = 'visibilityChanged' | 'activeLayerChanged' | 'changed';

/**
 * Client-side store to track which waypoint layers are displayed.
 *
 * This store manages the visibility state of waypoint layers (collections)
 * and tracks which layer is currently active for editing operations.
 *
 * @example
 * ```typescript
 * const store = new WaypointLayersStore();
 * store.init(spaceDriver, shipId);
 *
 * // Show only 'route' layer
 * store.hideAllLayers();
 * store.setLayerVisible('route', true);
 *
 * // Use with ObjectsLayer
 * const waypointsLayer = new ObjectsLayer(
 *     root, spaceDriver, 32,
 *     (w) => w.color,
 *     tacticalDrawWaypoints,
 *     undefined,
 *     store.createVisibilityFilter(),
 * );
 * ```
 */
export class WaypointLayersStore {
    public readonly events = new EventEmitter<WaypointLayersStoreEvents>();

    /** Which layers (collections) are currently visible */
    private visibleLayers = new Set<string>();

    /** Which layer is currently active for editing */
    private activeLayer: string | null = null;

    /** Ship ID to filter waypoints (optional - if set, only waypoints owned by this ship are considered) */
    private shipId: string | null = null;

    /** Space driver for accessing waypoints */
    private spaceDriver: SpaceDriver | null = null;

    /**
     * Initialize the store with a space driver and optional ship ID.
     * If shipId is provided, only waypoints owned by that ship will be considered.
     *
     * @param spaceDriver - The space driver to get waypoints from
     * @param shipId - Optional ship ID to filter waypoints by owner
     */
    init(spaceDriver: SpaceDriver, shipId?: string): this {
        this.spaceDriver = spaceDriver;
        this.shipId = shipId ?? null;

        // Initially show all available layers
        const layers = this.getAvailableLayers();
        for (const layer of layers) {
            this.visibleLayers.add(layer);
        }

        return this;
    }

    /**
     * Get all available layer names from the current waypoints.
     * Returns unique collection names from all waypoints (filtered by shipId if set).
     */
    getAvailableLayers(): string[] {
        if (!this.spaceDriver) {
            return [];
        }

        const layers = new Set<string>();
        for (const waypoint of this.spaceDriver.state.getAll('Waypoint')) {
            if (this.matchesShipFilter(waypoint)) {
                layers.add(waypoint.collection);
            }
        }

        return [...layers].sort();
    }

    /**
     * Check if a waypoint matches the ship filter (if any).
     */
    private matchesShipFilter(waypoint: Waypoint): boolean {
        if (this.shipId === null) {
            return true;
        }
        return waypoint.owner === this.shipId;
    }

    /**
     * Check if a layer is currently visible.
     */
    isLayerVisible(layerName: string): boolean {
        return this.visibleLayers.has(layerName);
    }

    /**
     * Set the visibility of a specific layer.
     */
    setLayerVisible(layerName: string, visible: boolean): void {
        const wasVisible = this.visibleLayers.has(layerName);
        if (visible && !wasVisible) {
            this.visibleLayers.add(layerName);
            this.emitChange('visibilityChanged');
        } else if (!visible && wasVisible) {
            this.visibleLayers.delete(layerName);
            this.emitChange('visibilityChanged');
        }
    }

    /**
     * Toggle the visibility of a specific layer.
     */
    toggleLayerVisibility(layerName: string): void {
        this.setLayerVisible(layerName, !this.isLayerVisible(layerName));
    }

    /**
     * Show all available layers.
     */
    showAllLayers(): void {
        const layers = this.getAvailableLayers();
        let changed = false;
        for (const layer of layers) {
            if (!this.visibleLayers.has(layer)) {
                this.visibleLayers.add(layer);
                changed = true;
            }
        }
        if (changed) {
            this.emitChange('visibilityChanged');
        }
    }

    /**
     * Hide all layers.
     */
    hideAllLayers(): void {
        if (this.visibleLayers.size > 0) {
            this.visibleLayers.clear();
            this.emitChange('visibilityChanged');
        }
    }

    /**
     * Get the names of all currently visible layers.
     */
    getVisibleLayers(): string[] {
        return [...this.visibleLayers];
    }

    /**
     * Get the currently active layer (for editing operations).
     */
    getActiveLayer(): string | null {
        return this.activeLayer;
    }

    /**
     * Set the active layer for editing operations.
     * Setting to null means no layer is active.
     */
    setActiveLayer(layerName: string | null): void {
        if (this.activeLayer !== layerName) {
            this.activeLayer = layerName;
            this.emitChange('activeLayerChanged');
        }
    }

    /**
     * Cycle to the next available layer as active.
     * If no layer is active, activates the first available layer.
     * If the last layer is active, cycles back to the first.
     */
    cycleActiveLayer(): void {
        const layers = this.getAvailableLayers();
        if (layers.length === 0) {
            this.setActiveLayer(null);
            return;
        }

        if (this.activeLayer === null) {
            this.setActiveLayer(layers[0]);
            return;
        }

        const currentIndex = layers.indexOf(this.activeLayer);
        if (currentIndex === -1 || currentIndex === layers.length - 1) {
            this.setActiveLayer(layers[0]);
        } else {
            this.setActiveLayer(layers[currentIndex + 1]);
        }
    }

    /**
     * Create a filter function for use with ObjectsLayer.
     * The filter returns true for waypoints that:
     * 1. Match the ship filter (if set)
     * 2. Are in a visible layer
     *
     * @param additionalFilter - Optional additional filter to apply
     * @returns A filter function suitable for ObjectsLayer
     */
    createVisibilityFilter(additionalFilter?: (waypoint: Waypoint) => boolean): (waypoint: Waypoint) => boolean {
        return (waypoint: Waypoint) => {
            // Check ship filter
            if (!this.matchesShipFilter(waypoint)) {
                return false;
            }

            // Check layer visibility
            if (!this.visibleLayers.has(waypoint.collection)) {
                return false;
            }

            // Apply additional filter if provided
            if (additionalFilter && !additionalFilter(waypoint)) {
                return false;
            }

            return true;
        };
    }

    /**
     * Get the alpha value for a waypoint based on whether it's in the active layer.
     * Active layer waypoints get full opacity (1.0), others get reduced opacity.
     *
     * @param inactiveAlpha - Alpha value for waypoints not in the active layer (default: 0.5)
     * @returns A function that returns the alpha value for a waypoint
     */
    createAlphaFunction(inactiveAlpha = 0.5): (waypoint: Waypoint) => number {
        return (waypoint: Waypoint) => {
            // If no active layer is set, all waypoints get full opacity
            if (this.activeLayer === null) {
                return 1;
            }
            // Active layer gets full opacity, others get reduced
            return waypoint.collection === this.activeLayer ? 1 : inactiveAlpha;
        };
    }

    /**
     * Subscribe to store changes.
     *
     * @param event - The event type to listen for, or 'changed' for any change
     * @param callback - The callback to invoke when the event fires
     * @returns A function to unsubscribe
     */
    onChange(event: WaypointLayersStoreEvents, callback: () => void): () => void {
        this.events.on(event, callback);
        return () => {
            this.events.off(event, callback);
        };
    }

    private emitChange(event: 'visibilityChanged' | 'activeLayerChanged'): void {
        this.events.emit(event);
        this.events.emit('changed');
    }
}
