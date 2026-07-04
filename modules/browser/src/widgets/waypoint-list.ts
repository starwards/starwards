import { Add, Remove } from 'colyseus-events';
import { Destructors, SpaceDriver, Waypoint, spaceCommands } from '@starwards/core';
import { addButton, addInputBlade, createPane } from '../panel';

import { FolderApi } from 'tweakpane';
import { WidgetContainer } from '../container';
import { readWriteProp } from '../property-wrappers';

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

    const foldersByWpId = new Map<string, FolderApi>();

    function addWaypointRow(wp: Waypoint) {
        if (foldersByWpId.has(wp.id)) return;

        const titleProp = readWriteProp<string>(spaceDriver, `/Waypoint/${wp.id}/title`);
        const folder = pane.addFolder({ title: wpTitle(titleProp.getValue(), wp.id), expanded: false });
        foldersByWpId.set(wp.id, folder);

        // Accordion: expanding one waypoint collapses all others
        folder.on('fold', (ev) => {
            if (ev.expanded) {
                for (const [id, f] of foldersByWpId) {
                    if (id !== wp.id && f.expanded) {
                        f.expanded = false;
                    }
                }
            }
        });

        addInputBlade<string>(
            folder,
            {
                getValue: titleProp.getValue,
                setValue: titleProp.setValue,
                onChange: (cb) =>
                    titleProp.onChange(() => {
                        folder.title = wpTitle(titleProp.getValue(), wp.id);
                        cb();
                    }),
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

    return pane;
}
