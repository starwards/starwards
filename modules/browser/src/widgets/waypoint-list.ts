import { Add, Remove } from 'colyseus-events';
import { Destructors, SpaceDriver, Waypoint, spaceCommands } from '@starwards/core';
import { addButton, addInputBlade, createPane } from '../panel';
import { readProp, readWriteProp } from '../property-wrappers';

import { ButtonApi } from 'tweakpane';
import { WidgetContainer } from '../container';

function wpTitle(title: string | undefined, id: string): string {
    return title || id.slice(0, 6);
}

export function drawWaypointList(container: WidgetContainer, spaceDriver: SpaceDriver, shipId: string) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    // Bound the panel so a long waypoint list scrolls instead of growing over other panels
    container.getElement().css({ 'max-height': '35vh', 'overflow-y': 'auto', 'overflow-x': 'hidden' });

    const pane = createPane({ title: 'Waypoints', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());

    // Shared edit section — hidden until a waypoint is selected
    const editFolder = pane.addFolder({ title: 'Edit', expanded: true });
    editFolder.hidden = true;
    let editSession: Destructors | null = null;
    let selectedWpId: string | null = null;

    function selectWaypoint(wpId: string) {
        if (selectedWpId === wpId) return;

        // Tear down previous edit session
        if (editSession) {
            editSession.destroy();
            editSession = null;
        }
        for (const child of [...editFolder.children]) child.dispose();

        selectedWpId = wpId;
        const session = new Destructors();
        editSession = session;

        const titleProp = readWriteProp<string>(spaceDriver, `/Waypoint/${wpId}/title`);
        const updateFolderTitle = () => {
            editFolder.title = `Edit: ${wpTitle(titleProp.getValue(), wpId)}`;
        };
        updateFolderTitle();
        session.add(titleProp.onChange(updateFolderTitle));
        editFolder.hidden = false;

        addInputBlade<string>(editFolder, titleProp, { label: 'name' }, session.add);
        addButton(
            editFolder,
            () => spaceDriver.command(spaceCommands.bulkDeleteOrder, { ids: [wpId] }),
            { label: 'Delete', title: 'Delete' },
            session.add,
        );
    }

    cleanup.add(() => {
        if (editSession) editSession.destroy();
    });

    // List of waypoint buttons — one per waypoint, always visible
    const buttonsByWpId = new Map<string, { button: ButtonApi; unsub: () => void }>();

    function addWaypointRow(wp: Waypoint) {
        if (buttonsByWpId.has(wp.id)) return;

        const titleProp = readProp<string>(spaceDriver, `/Waypoint/${wp.id}/title`);
        const button = pane.addButton({ title: wpTitle(titleProp.getValue(), wp.id) });
        const unsub = titleProp.onChange(() => {
            button.title = wpTitle(titleProp.getValue(), wp.id);
        });
        button.on('click', () => selectWaypoint(wp.id));
        buttonsByWpId.set(wp.id, { button, unsub });
    }

    function removeWaypointRow(wpId: string) {
        const entry = buttonsByWpId.get(wpId);
        if (entry) {
            entry.unsub();
            entry.button.dispose();
            buttonsByWpId.delete(wpId);
        }
        if (selectedWpId === wpId) {
            if (editSession) {
                editSession.destroy();
                editSession = null;
            }
            for (const child of [...editFolder.children]) child.dispose();
            editFolder.hidden = true;
            selectedWpId = null;
        }
    }

    cleanup.add(() => {
        for (const { unsub } of buttonsByWpId.values()) unsub();
    });

    // Populate existing waypoints
    for (const wp of spaceDriver.state.getAll('Waypoint')) {
        if (wp.owner === shipId && !wp.destroyed) {
            addWaypointRow(wp);
        }
    }

    // Listen for new waypoints added
    const onAdd = (e: Add) => {
        const match = /^\/Waypoint\/([^/]+)$/.exec(e.path);
        if (!match) return;
        const wpId = match[1];
        const wp = spaceDriver.state.get(wpId);
        if (wp && Waypoint.isInstance(wp) && wp.owner === shipId && !wp.destroyed) {
            addWaypointRow(wp);
        }
    };

    // Listen for waypoints removed/destroyed
    const onRemove = (e: Remove) => {
        const match = /^\/Waypoint\/([^/]+)$/.exec(e.path);
        if (!match) return;
        removeWaypointRow(match[1]);
    };

    spaceDriver.events.on('$add', onAdd);
    spaceDriver.events.on('$remove', onRemove);
    cleanup.add(() => {
        spaceDriver.events.off('$add', onAdd);
        spaceDriver.events.off('$remove', onRemove);
    });

    return pane;
}
