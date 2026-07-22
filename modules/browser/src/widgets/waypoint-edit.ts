import * as SearchListPlugin from 'tweakpane4-search-list-plugin';

import { Destructors, SpaceDriver, Waypoint, XY, spaceCommands } from '@starwards/core';
import { addButton, addColorBlade, addInputBlade, createPane } from '../panel';
import { readProp, readWriteProp } from '../property-wrappers';

import { addGroupPickerBlade } from './waypoint-group-picker';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';

const CLONE_OFFSET = 500;

function wpTitle(title: string | undefined, id: string): string {
    return title || id.slice(0, 6);
}

/**
 * Edit pane for the waypoints currently selected on the relay radar (a limited form of the
 * GM tweak pane): one subsection per selected waypoint with rename, group (move to an
 * existing group or a newly typed one), color, exact position, focus (center the camera on
 * it), clone (a copy in the waypoint's own group, slightly offset) and delete.
 */
export function drawWaypointEdit(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipId: string,
    selection: SelectionContainer,
    focus: (position: XY) => void,
) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    const pane = createPane({ title: 'Edit Waypoint', container: container.getElement().get(0) });
    pane.registerPlugin(SearchListPlugin);
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
            const nameBlade = addInputBlade<string>(folder, titleProp, { label: 'name' }, currentSession.add);
            // an unnamed waypoint has an empty title — hint at the id-prefix fallback shown on the radar
            const nameInput = nameBlade.element.querySelector('input');
            if (nameInput) nameInput.placeholder = wp.id.slice(0, 6);

            const collectionProp = readWriteProp<string>(spaceDriver, `/Waypoint/${wp.id}/collection`);
            addInputBlade<string>(folder, collectionProp, { label: 'group' }, currentSession.add);
            addGroupPickerBlade(folder, collectionProp, 'move to', spaceDriver, shipId, currentSession.add);

            addColorBlade(
                folder,
                readWriteProp<number>(spaceDriver, `/Waypoint/${wp.id}/color`),
                { label: 'color' },
                currentSession.add,
            );

            for (const axis of ['x', 'y'] as const) {
                const axisProp = readProp<number>(spaceDriver, `/Waypoint/${wp.id}/position/${axis}`);
                addInputBlade<number>(
                    folder,
                    {
                        getValue: axisProp.getValue,
                        onChange: axisProp.onChange,
                        setValue: (v: number) => {
                            const current = axisProp.getValue() ?? 0;
                            const delta = { x: 0, y: 0, [axis]: v - current };
                            spaceDriver.command(spaceCommands.bulkMove, { ids: [wp.id], delta });
                        },
                    },
                    { label: axis },
                    currentSession.add,
                );
            }

            addButton(folder, () => focus(wp.position), { label: 'Focus', title: 'Focus' }, currentSession.add);

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

        if (waypoints.length > 1) {
            addButton(
                pane,
                () => spaceDriver.command(spaceCommands.bulkDeleteOrder, { ids: waypoints.map((w) => w.id) }),
                { label: `${waypoints.length} waypoints`, title: 'Delete all' },
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
