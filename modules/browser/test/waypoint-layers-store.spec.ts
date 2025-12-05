import { createMockSpaceDriver, createMockWaypoint } from '../src/gallery/mocks/space-driver';
import { SpaceDriver } from '@starwards/core';
import { WaypointLayersStore } from '../src/radar/waypoint-layers-store';
import { expect } from 'chai';

describe('WaypointLayersStore', () => {
    describe('initialization', () => {
        it('should initialize with no visible layers when no waypoints exist', () => {
            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver([]);
            store.init(spaceDriver as unknown as SpaceDriver);

            expect(store.getAvailableLayers()).to.deep.equal([]);
            expect(store.getVisibleLayers()).to.deep.equal([]);
        });

        it('should show all available layers after init', () => {
            const waypoints = [
                createMockWaypoint({ id: 'wp1', collection: 'route' }),
                createMockWaypoint({ id: 'wp2', collection: 'markers' }),
                createMockWaypoint({ id: 'wp3', collection: 'route' }),
            ];
            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver(waypoints);
            store.init(spaceDriver as unknown as SpaceDriver);

            expect(store.getAvailableLayers()).to.deep.equal(['markers', 'route']);
            expect(store.getVisibleLayers().sort()).to.deep.equal(['markers', 'route']);
        });

        it('should filter waypoints by shipId when provided', () => {
            const waypoints = [
                createMockWaypoint({ id: 'wp1', collection: 'route', owner: 'ship1' }),
                createMockWaypoint({ id: 'wp2', collection: 'markers', owner: 'ship2' }),
                createMockWaypoint({ id: 'wp3', collection: 'targets', owner: 'ship1' }),
            ];
            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver(waypoints);
            store.init(spaceDriver as unknown as SpaceDriver, 'ship1');

            expect(store.getAvailableLayers()).to.deep.equal(['route', 'targets']);
        });
    });

    describe('layer visibility', () => {
        let store: WaypointLayersStore;

        beforeEach(() => {
            const waypoints = [
                createMockWaypoint({ id: 'wp1', collection: 'route' }),
                createMockWaypoint({ id: 'wp2', collection: 'markers' }),
                createMockWaypoint({ id: 'wp3', collection: 'targets' }),
            ];
            store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver(waypoints);
            store.init(spaceDriver as unknown as SpaceDriver);
        });

        it('should report layer visibility correctly', () => {
            expect(store.isLayerVisible('route')).to.be.true;
            expect(store.isLayerVisible('markers')).to.be.true;
            expect(store.isLayerVisible('nonexistent')).to.be.false;
        });

        it('should set layer visibility', () => {
            store.setLayerVisible('route', false);
            expect(store.isLayerVisible('route')).to.be.false;

            store.setLayerVisible('route', true);
            expect(store.isLayerVisible('route')).to.be.true;
        });

        it('should toggle layer visibility', () => {
            expect(store.isLayerVisible('route')).to.be.true;

            store.toggleLayerVisibility('route');
            expect(store.isLayerVisible('route')).to.be.false;

            store.toggleLayerVisibility('route');
            expect(store.isLayerVisible('route')).to.be.true;
        });

        it('should hide all layers', () => {
            store.hideAllLayers();
            expect(store.getVisibleLayers()).to.deep.equal([]);
        });

        it('should show all layers', () => {
            store.hideAllLayers();
            store.showAllLayers();
            expect(store.getVisibleLayers().sort()).to.deep.equal(['markers', 'route', 'targets']);
        });

        it('should emit visibilityChanged event when visibility changes', () => {
            let visibilityEventCount = 0;
            let changedEventCount = 0;

            store.onChange('visibilityChanged', () => visibilityEventCount++);
            store.onChange('changed', () => changedEventCount++);

            store.setLayerVisible('route', false);
            expect(visibilityEventCount).to.equal(1);
            expect(changedEventCount).to.equal(1);

            // Setting to the same value should not emit
            store.setLayerVisible('route', false);
            expect(visibilityEventCount).to.equal(1);
            expect(changedEventCount).to.equal(1);
        });
    });

    describe('active layer', () => {
        let store: WaypointLayersStore;

        beforeEach(() => {
            const waypoints = [
                createMockWaypoint({ id: 'wp1', collection: 'route' }),
                createMockWaypoint({ id: 'wp2', collection: 'markers' }),
                createMockWaypoint({ id: 'wp3', collection: 'targets' }),
            ];
            store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver(waypoints);
            store.init(spaceDriver as unknown as SpaceDriver);
        });

        it('should have no active layer initially', () => {
            expect(store.getActiveLayer()).to.be.null;
        });

        it('should set and get active layer', () => {
            store.setActiveLayer('route');
            expect(store.getActiveLayer()).to.equal('route');

            store.setActiveLayer(null);
            expect(store.getActiveLayer()).to.be.null;
        });

        it('should cycle through available layers', () => {
            store.cycleActiveLayer();
            expect(store.getActiveLayer()).to.equal('markers');

            store.cycleActiveLayer();
            expect(store.getActiveLayer()).to.equal('route');

            store.cycleActiveLayer();
            expect(store.getActiveLayer()).to.equal('targets');

            store.cycleActiveLayer();
            expect(store.getActiveLayer()).to.equal('markers'); // Wraps around
        });

        it('should emit activeLayerChanged event when active layer changes', () => {
            let activeLayerEventCount = 0;
            let changedEventCount = 0;

            store.onChange('activeLayerChanged', () => activeLayerEventCount++);
            store.onChange('changed', () => changedEventCount++);

            store.setActiveLayer('route');
            expect(activeLayerEventCount).to.equal(1);
            expect(changedEventCount).to.equal(1);

            // Setting to the same value should not emit
            store.setActiveLayer('route');
            expect(activeLayerEventCount).to.equal(1);
            expect(changedEventCount).to.equal(1);
        });
    });

    describe('visibility filter', () => {
        it('should create a filter that passes visible layers', () => {
            const waypoints = [
                createMockWaypoint({ id: 'wp1', collection: 'route', owner: 'ship1' }),
                createMockWaypoint({ id: 'wp2', collection: 'markers', owner: 'ship1' }),
            ];
            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver(waypoints);
            store.init(spaceDriver as unknown as SpaceDriver, 'ship1');

            const filter = store.createVisibilityFilter();

            expect(filter(waypoints[0])).to.be.true;
            expect(filter(waypoints[1])).to.be.true;

            store.setLayerVisible('route', false);
            expect(filter(waypoints[0])).to.be.false;
            expect(filter(waypoints[1])).to.be.true;
        });

        it('should filter by ship owner', () => {
            const wp1 = createMockWaypoint({ id: 'wp1', collection: 'route', owner: 'ship1' });
            const wp2 = createMockWaypoint({ id: 'wp2', collection: 'route', owner: 'ship2' });

            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver([wp1, wp2]);
            store.init(spaceDriver as unknown as SpaceDriver, 'ship1');

            const filter = store.createVisibilityFilter();

            expect(filter(wp1)).to.be.true;
            expect(filter(wp2)).to.be.false;
        });

        it('should apply additional filter', () => {
            const wp1 = createMockWaypoint({ id: 'wp1', collection: 'route', title: 'keep' });
            const wp2 = createMockWaypoint({ id: 'wp2', collection: 'route', title: 'remove' });

            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver([wp1, wp2]);
            store.init(spaceDriver as unknown as SpaceDriver);

            const filter = store.createVisibilityFilter((wp) => wp.title === 'keep');

            expect(filter(wp1)).to.be.true;
            expect(filter(wp2)).to.be.false;
        });
    });

    describe('alpha function', () => {
        it('should return 1 for all waypoints when no active layer', () => {
            const waypoints = [
                createMockWaypoint({ id: 'wp1', collection: 'route' }),
                createMockWaypoint({ id: 'wp2', collection: 'markers' }),
            ];
            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver(waypoints);
            store.init(spaceDriver as unknown as SpaceDriver);

            const alphaFn = store.createAlphaFunction();

            expect(alphaFn(waypoints[0])).to.equal(1);
            expect(alphaFn(waypoints[1])).to.equal(1);
        });

        it('should return 1 for active layer and reduced for others', () => {
            const waypoints = [
                createMockWaypoint({ id: 'wp1', collection: 'route' }),
                createMockWaypoint({ id: 'wp2', collection: 'markers' }),
            ];
            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver(waypoints);
            store.init(spaceDriver as unknown as SpaceDriver);

            store.setActiveLayer('route');
            const alphaFn = store.createAlphaFunction();

            expect(alphaFn(waypoints[0])).to.equal(1);
            expect(alphaFn(waypoints[1])).to.equal(0.5);
        });

        it('should use custom inactive alpha value', () => {
            const waypoints = [
                createMockWaypoint({ id: 'wp1', collection: 'route' }),
                createMockWaypoint({ id: 'wp2', collection: 'markers' }),
            ];
            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver(waypoints);
            store.init(spaceDriver as unknown as SpaceDriver);

            store.setActiveLayer('route');
            const alphaFn = store.createAlphaFunction(0.3);

            expect(alphaFn(waypoints[0])).to.equal(1);
            expect(alphaFn(waypoints[1])).to.equal(0.3);
        });
    });

    describe('event unsubscription', () => {
        it('should allow unsubscribing from events', () => {
            const store = new WaypointLayersStore();
            const spaceDriver = createMockSpaceDriver([createMockWaypoint({ collection: 'route' })]);
            store.init(spaceDriver as unknown as SpaceDriver);

            let eventCount = 0;
            const unsubscribe = store.onChange('changed', () => eventCount++);

            store.setLayerVisible('route', false);
            expect(eventCount).to.equal(1);

            unsubscribe();
            store.setLayerVisible('route', true);
            expect(eventCount).to.equal(1); // Should not have increased
        });
    });
});
