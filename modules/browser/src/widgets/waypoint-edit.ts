import { Destructors, SpaceDriver, Waypoint, spaceCommands } from '@starwards/core';
import { addButton, addInputBlade, createPane } from '../panel';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
import { readWriteProp } from '../property-wrappers';

const CLONE_OFFSET = 500;

function wpTitle(title: string | undefined, id: string): string {
    return title || id.slice(0, 6);
}

/**
 * Edit pane for the waypoints currently selected on the relay radar (a limited form of the
 * GM tweak pane): one subsection per selected waypoint with rename, clone (a copy in the
 * waypoint's own group, slightly offset) and delete.
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

        for (const wp of waypoints) {
            const folder = pane.addFolder({ title: wpTitle(wp.title, wp.id), expanded: true });
            currentSession.add(() => folder.dispose());

            const titleProp = readWriteProp<string>(spaceDriver, `/Waypoint/${wp.id}/title`);
            currentSession.add(
                titleProp.onChange(() => {
                    folder.title = wpTitle(titleProp.getValue(), wp.id);
                }),
            );
            addInputBlade<string>(folder, titleProp, { label: 'name' }, currentSession.add);

            addButton(
                folder,
                () =>
                    spaceDriver.command(spaceCommands.createWaypointOrder, {
                        position: { x: wp.position.x + CLONE_OFFSET, y: wp.position.y + CLONE_OFFSET },
                        owner: shipId,
                        title: wp.title,
                        collection: wp.collection,
                        color: wp.color,
                    }),
                { label: 'Clone', title: 'Clone' },
                currentSession.add,
            );

            addButton(
                folder,
                () => spaceDriver.command(spaceCommands.bulkDeleteOrder, { ids: [wp.id] }),
                { label: 'Delete', title: 'Delete' },
                currentSession.add,
            );
        }
    }

    render();
    selection.events.on('changed', render);
    cleanup.add(() => {
        selection.events.off('changed', render);
        if (session) session.destroy();
    });

    return pane;
}
