import { createMockSpaceDriver, createMockWaypoint } from '../mocks/space-driver';

import { Scene } from './index';
import { SelectionContainer } from '../../radar/selection-container';
import { Waypoint } from '@starwards/core';
import { createMockContainer } from '../mocks/container';
import { drawPlacementSettings } from '../../widgets/waypoint-placement-settings';
import { drawWaypointEdit } from '../../widgets/waypoint-edit';
import { drawWaypointGroups } from '../../widgets/waypoint-groups';

const SHIP_ID = 'player';

function waypoint(id: string, x: number, y: number, collection: string, color: number, title = ''): Waypoint {
    const wp = createMockWaypoint({ id, position: { x, y } });
    wp.owner = SHIP_ID;
    wp.collection = collection;
    wp.color = color;
    wp.title = title;
    return wp;
}

/** Two groups on the dradis map: a patrol route (three waypoints) and a single rally point. */
function dradisWaypoints() {
    return [
        waypoint('wp-patrol-a', 1000, 0, 'patrol', 0x33ccff, 'Alpha'),
        waypoint('wp-patrol-b', 2000, 500, 'patrol', 0x33ccff),
        waypoint('wp-patrol-c', 3000, 0, 'patrol', 0x33ccff),
        waypoint('wp-rally', -1500, 800, 'rally', 0xff9933, 'Rally'),
    ];
}

function withDradis(scene: Scene): Scene {
    return {
        ...scene,
        setup(container) {
            document.body.dataset.station = 'dradis';
            return scene.setup(container);
        },
        teardown() {
            delete document.body.dataset.station;
        },
    };
}

export const waypointScenes: Record<string, Scene> = {
    'waypoint-placement-settings': withDradis({
        name: 'waypoint-placement-settings',
        description: 'New Waypoint pane: group and color for waypoints dropped on the dradis map',
        setup(container: HTMLElement) {
            const spaceDriver = createMockSpaceDriver(dradisWaypoints());
            drawPlacementSettings(
                createMockContainer(container, 300, 200),
                spaceDriver as never,
                SHIP_ID,
                () => undefined,
            );
        },
    }),
    'waypoint-groups': withDradis({
        name: 'waypoint-groups',
        description: 'Groups pane: one row per waypoint group, the fully-selected group lit',
        setup(container: HTMLElement) {
            const waypoints = dradisWaypoints();
            const spaceDriver = createMockSpaceDriver(waypoints);
            const selection = new SelectionContainer();
            const panel = drawWaypointGroups(
                createMockContainer(container, 300, 200),
                spaceDriver as never,
                SHIP_ID,
                selection,
                () => undefined,
            );
            panel.addGroup('patrol');
            panel.addGroup('rally');
            selection.set(waypoints.filter((wp) => wp.collection === 'rally'));
        },
    }),
    'waypoint-edit-single': withDradis({
        name: 'waypoint-edit-single',
        description: 'Edit Waypoint pane for one selected waypoint',
        setup(container: HTMLElement) {
            const waypoints = dradisWaypoints();
            const spaceDriver = createMockSpaceDriver(waypoints);
            const selection = new SelectionContainer();
            selection.set([waypoints[0]]);
            drawWaypointEdit(
                createMockContainer(container, 300, 300),
                spaceDriver as never,
                SHIP_ID,
                selection,
                () => undefined,
            );
        },
    }),
    'waypoint-edit-multiple': withDradis({
        name: 'waypoint-edit-multiple',
        description: 'Edit pane for a three-waypoint selection: one folder each plus delete-all',
        setup(container: HTMLElement) {
            const waypoints = dradisWaypoints();
            const spaceDriver = createMockSpaceDriver(waypoints);
            const selection = new SelectionContainer();
            selection.set(waypoints.filter((wp) => wp.collection === 'patrol'));
            drawWaypointEdit(
                createMockContainer(container, 300, 500),
                spaceDriver as never,
                SHIP_ID,
                selection,
                () => undefined,
            );
        },
    }),
};
