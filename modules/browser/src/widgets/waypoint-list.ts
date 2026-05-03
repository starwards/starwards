import { Add, Remove, Replace } from 'colyseus-events';
import { Destructors, SpaceDriver, Waypoint, spaceCommands } from '@starwards/core';
import { FolderApi, Pane } from 'tweakpane';
import { addButton, addInputBlade, createPane } from '../panel';

import { WidgetContainer } from '../container';

export function drawWaypointList(container: WidgetContainer, spaceDriver: SpaceDriver, shipId: string) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    const pane = createPane({ title: 'Waypoints', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());

    const foldersByWpId = new Map<string, FolderApi>();

    function addWaypointRow(wp: Waypoint) {
        if (foldersByWpId.has(wp.id)) return;
        const folder = pane.addFolder({ title: wp.id.slice(0, 6), expanded: true });
        foldersByWpId.set(wp.id, folder);

        const viewModel = { title: wp.title };
        const titlePath = `/Waypoint/${wp.id}/title`;

        addInputBlade<string>(
            folder,
            {
                getValue: () => viewModel.title,
                setValue: (v: string) => {
                    viewModel.title = v;
                    spaceDriver.sendJsonCmd(titlePath, v);
                },
                onChange: (cb) => {
                    const handler = (e: Replace) => {
                        if (e.path === titlePath && typeof e.value === 'string') {
                            viewModel.title = e.value;
                            cb();
                        }
                    };
                    spaceDriver.events.on('$replace', handler);
                    return () => spaceDriver.events.off('$replace', handler);
                },
            },
            { label: 'title' },
            cleanup.add,
        );

        addButton(
            folder,
            () => {
                spaceDriver.command(spaceCommands.bulkDeleteOrder, { ids: [wp.id] });
            },
            { label: 'Delete', title: 'Delete' },
            cleanup.add,
        );
    }

    function removeWaypointRow(wpId: string) {
        const folder = foldersByWpId.get(wpId);
        if (folder) {
            folder.dispose();
            foldersByWpId.delete(wpId);
        }
    }

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

    return pane as unknown as Pane;
}
