import { Destructors, SpaceDriver, XY, spaceCommands } from '@starwards/core';
import { addButton, addColorBlade, addInputBlade, createPane } from '../panel';
import { groupDisplayName, ownWaypoints } from '../radar/waypoint-group-layers';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
import { writeProp } from '../property-wrappers';

export type WaypointGroupsPanel = {
    addGroup: (collection: string) => void;
    removeGroup: (collection: string) => void;
};

/**
 * Group-level operations for the ship's waypoint groups (the waypoint `collection` field):
 * rename, recolor, select all, focus (center the camera on the group) and delete — each
 * applied to every waypoint in the group.
 */
export function drawWaypointGroups(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipId: string,
    selection: SelectionContainer,
    focus: (position: XY) => void,
): WaypointGroupsPanel {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    const pane = createPane({ title: 'Groups', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());

    const folders = new Map<string, Destructors>();

    function members(collection: string) {
        return ownWaypoints(spaceDriver, shipId).filter((wp) => wp.collection === collection);
    }

    function addGroup(collection: string) {
        if (folders.has(collection)) return;
        const session = new Destructors();
        folders.set(collection, session);
        cleanup.add(session.destroy);

        const folder = pane.addFolder({ title: groupDisplayName(collection), expanded: false });
        session.add(() => folder.dispose());

        addInputBlade<string>(
            folder,
            {
                getValue: () => collection,
                onChange: () => () => undefined,
                setValue: (newName: string) => {
                    const wasVisible = spaceDriver.state.isWaypointGroupVisible(shipId, collection);
                    for (const wp of members(collection)) {
                        writeProp<string>(spaceDriver, `/Waypoint/${wp.id}/collection`).setValue(newName);
                    }
                    // the visibility flag is keyed by (owner, collection) — carry it to the new name
                    spaceDriver.command(spaceCommands.setWaypointGroupVisibility, {
                        owner: shipId,
                        collection: newName,
                        visibleToPilot: wasVisible,
                    });
                },
            },
            { label: 'rename' },
            session.add,
        );

        addColorBlade(
            folder,
            {
                getValue: () => members(collection)[0]?.color ?? 0xffffff,
                onChange: () => () => undefined,
                setValue: (color: number) => {
                    for (const wp of members(collection)) {
                        writeProp<number>(spaceDriver, `/Waypoint/${wp.id}/color`).setValue(color);
                    }
                },
            },
            { label: 'color' },
            session.add,
        );

        addInputBlade<boolean>(
            folder,
            {
                getValue: () => spaceDriver.state.isWaypointGroupVisible(shipId, collection),
                onChange: () => () => undefined,
                setValue: (visible: boolean) => {
                    spaceDriver.command(spaceCommands.setWaypointGroupVisibility, {
                        owner: shipId,
                        collection,
                        visibleToPilot: visible,
                    });
                },
            },
            { label: 'visible to pilot' },
            session.add,
        );

        addButton(folder, () => selection.set(members(collection)), { label: '', title: 'Select all' }, session.add);
        addButton(
            folder,
            () => {
                const positions = members(collection).map((wp) => XY.clone(wp.position));
                if (positions.length === 0) return;
                focus(XY.scale(positions.reduce(XY.add), 1 / positions.length));
            },
            { label: '', title: 'Focus' },
            session.add,
        );
        addButton(
            folder,
            () =>
                spaceDriver.command(spaceCommands.bulkDeleteOrder, {
                    ids: members(collection).map((wp) => wp.id),
                }),
            { label: '', title: 'Delete group' },
            session.add,
        );
    }

    function removeGroup(collection: string) {
        const session = folders.get(collection);
        if (session) {
            session.destroy();
            folders.delete(collection);
        }
    }

    return { addGroup, removeGroup };
}
