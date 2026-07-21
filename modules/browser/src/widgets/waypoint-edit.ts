import { Destructors, SpaceDriver, Waypoint, spaceCommands } from '@starwards/core';
import { addButton, addInputBlade, createPane } from '../panel';
import { blue, green, red, white, yellow } from '../colors';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
import { readWriteProp } from '../property-wrappers';

const GROUP_PALETTE = [white, yellow, red, blue, green];

function groupColor(spaceDriver: SpaceDriver, shipId: string, collection: string): number {
    for (const wp of spaceDriver.state.getAll('Waypoint')) {
        if (wp.owner === shipId && !wp.destroyed && wp.collection === collection) {
            return wp.color;
        }
    }
    let hash = 0;
    for (const char of collection) {
        hash = (hash * 31 + char.charCodeAt(0)) | 0;
    }
    return GROUP_PALETTE[Math.abs(hash) % GROUP_PALETTE.length];
}

/**
 * Edit pane for the waypoints currently selected on the relay radar (a limited form of the
 * GM tweak pane): rename (single selection), delete, and clone the selection into a group.
 */
export function drawWaypointEdit(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipId: string,
    selection: SelectionContainer,
) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    const pane = createPane({ title: 'Edit Waypoint', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());

    let session: Destructors | null = null;

    function selectedWaypoints(): Waypoint[] {
        return [...selection.selectedItems].filter(Waypoint.isInstance);
    }

    function render() {
        if (session) {
            session.destroy();
            session = null;
        }
        for (const child of [...pane.children]) child.dispose();

        const waypoints = selectedWaypoints();
        pane.hidden = waypoints.length === 0;
        if (waypoints.length === 0) return;

        const currentSession = new Destructors();
        session = currentSession;
        pane.title = waypoints.length === 1 ? 'Edit Waypoint' : `Edit ${waypoints.length} Waypoints`;

        if (waypoints.length === 1) {
            const titleProp = readWriteProp<string>(spaceDriver, `/Waypoint/${waypoints[0].id}/title`);
            addInputBlade<string>(pane, titleProp, { label: 'name' }, currentSession.add);
        }

        const cloneParams = { group: '' };
        const groupBinding = pane.addBinding(cloneParams, 'group');
        currentSession.add(() => groupBinding.dispose());
        addButton(
            pane,
            () => {
                const group = cloneParams.group.trim();
                if (!group) return;
                const color = groupColor(spaceDriver, shipId, group);
                for (const wp of selectedWaypoints()) {
                    spaceDriver.command(spaceCommands.createWaypointOrder, {
                        position: { x: wp.position.x, y: wp.position.y },
                        owner: shipId,
                        title: wp.title,
                        collection: group,
                        color,
                    });
                }
            },
            { label: 'Clone to group', title: 'Clone' },
            currentSession.add,
        );

        addButton(
            pane,
            () => spaceDriver.command(spaceCommands.bulkDeleteOrder, { ids: waypoints.map((wp) => wp.id) }),
            { label: 'Delete', title: 'Delete' },
            currentSession.add,
        );
    }

    render();
    selection.events.on('changed', render);
    cleanup.add(() => {
        selection.events.off('changed', render);
        if (session) session.destroy();
    });

    return pane;
}
