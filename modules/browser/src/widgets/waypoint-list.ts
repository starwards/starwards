import * as ItemListPlugin from 'tweakpane4-item-list-plugin';

import { Add, Remove } from 'colyseus-events';
import { Destructors, SpaceDriver, Waypoint, spaceCommands } from '@starwards/core';
import { addButton, addInputBlade, createPane } from '../panel';
import { readProp, readWriteProp } from '../property-wrappers';

import { BindingApi } from '@tweakpane/core';
import { WidgetContainer } from '../container';

function wpTitle(title: string | undefined, id: string): string {
    return title || id.slice(0, 6);
}

function wpLabel(title: string | undefined, id: string): string {
    return `${wpTitle(title, id)} (${id.slice(0, 6)})`;
}

/**
 * Waypoints pane built on the tweakpane4-item-list-plugin blade: every owned waypoint is an
 * item row (✕ deletes it), and picking a waypoint from the dropdown opens it in the Edit
 * section (rename / delete).
 */
export function drawWaypointList(container: WidgetContainer, spaceDriver: SpaceDriver, shipId: string) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    // Bound the panel so a long waypoint list scrolls instead of growing over other panels
    container.getElement().css({ 'max-height': '35vh', 'overflow-y': 'auto', 'overflow-x': 'hidden' });

    const pane = createPane({ title: 'Waypoints', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());
    pane.registerPlugin(ItemListPlugin);

    // Shared edit section — hidden until a waypoint is selected
    const editFolder = pane.addFolder({ title: 'Edit', expanded: true });
    editFolder.hidden = true;
    let editSession: Destructors | null = null;
    let selectedWpId: string | null = null;

    function closeEdit() {
        if (editSession) {
            editSession.destroy();
            editSession = null;
        }
        for (const child of [...editFolder.children]) child.dispose();
        editFolder.hidden = true;
        selectedWpId = null;
    }
    cleanup.add(closeEdit);

    function selectWaypoint(wpId: string) {
        if (selectedWpId === wpId) return;
        closeEdit();

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

    // The item-list blade holds a static option set, so it is rebuilt whenever the
    // owned-waypoint set or any waypoint title changes.
    let listBinding: BindingApi | null = null;
    const listSubscriptions = new Destructors();
    cleanup.add(listSubscriptions.destroy);

    function ownWaypoints(): Waypoint[] {
        return [...spaceDriver.state.getAll('Waypoint')].filter((wp) => wp.owner === shipId && !wp.destroyed);
    }

    function rebuildList() {
        listBinding?.dispose();
        listSubscriptions.cleanup();

        const labelToId = new Map<string, string>();
        const labels: string[] = [];
        for (const wp of ownWaypoints()) {
            const titleProp = readProp<string>(spaceDriver, `/Waypoint/${wp.id}/title`);
            listSubscriptions.add(titleProp.onChange(rebuildList));
            const label = wpLabel(titleProp.getValue(), wp.id);
            labelToId.set(label, wp.id);
            labels.push(label);
        }

        // keep selection only while the waypoint still exists
        if (selectedWpId && ![...labelToId.values()].includes(selectedWpId)) {
            closeEdit();
        }

        const params = { waypoints: [...labels] };
        listBinding = pane.addBinding(params, 'waypoints', {
            index: 0,
            view: 'item-list',
            options: labels,
            pickText: 'Edit waypoint…',
            emptyText: 'No waypoints',
            onOptionClick: (label: string) => {
                const wpId = labelToId.get(label);
                if (wpId) selectWaypoint(wpId);
                return false; // selection only — never add duplicates to the list
            },
        });
        listBinding.on('change', () => {
            // an item removed via ✕ is a delete order for that waypoint
            const remaining = new Set(params.waypoints);
            const removed = labels.filter((label) => !remaining.has(label));
            const ids = removed.map((label) => labelToId.get(label)).filter((id): id is string => !!id);
            if (ids.length) {
                spaceDriver.command(spaceCommands.bulkDeleteOrder, { ids });
            }
        });
    }
    cleanup.add(() => listBinding?.dispose());

    rebuildList();

    const waypointPath = /^\/Waypoint\/([^/]+)$/;
    const onAdd = (e: Add) => {
        if (waypointPath.test(e.path)) rebuildList();
    };
    const onRemove = (e: Remove) => {
        const match = waypointPath.exec(e.path);
        if (!match) return;
        if (selectedWpId === match[1]) closeEdit();
        rebuildList();
    };

    spaceDriver.events.on('$add', onAdd);
    spaceDriver.events.on('$remove', onRemove);
    cleanup.add(() => {
        spaceDriver.events.off('$add', onAdd);
        spaceDriver.events.off('$remove', onRemove);
    });

    return pane;
}
