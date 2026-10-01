import { Add, Remove } from 'colyseus-events';
import { Destructors, SpaceDriver, XY, spaceCommands } from '@starwards/core';
import { addButton, addColorBlade, addInputBlade, createWidgetPane } from '../panel';
import { groupDisplayName, ownWaypoints } from '../radar/waypoint-group-layers';
import { readProp, writeProp } from '../property-wrappers';

import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';

type WaypointGroupsPanel = {
    addGroup: (collection: string) => void;
    removeGroup: (collection: string) => void;
};

const WAYPOINT_PATH = /^\/Waypoint\/([^/]+)$/;

function toCssColor(color: number) {
    return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Group-level operations for the ship's waypoint groups (the waypoint `collection` field):
 * rename, recolor, select all, focus (center the camera on the group) and delete — each
 * applied to every waypoint in the group. Each group is a row: colour dot, name, waypoint
 * count; the row is lit while every member is selected.
 */
export function drawWaypointGroups(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipId: string,
    selection: SelectionContainer,
    focus: (position: XY) => void,
): WaypointGroupsPanel {
    const { pane, cleanup } = createWidgetPane(container, 'Groups');

    const folders = new Map<string, { session: Destructors; refresh: () => void }>();
    const watched = new Map<string, () => void>();

    function members(collection: string) {
        return ownWaypoints(spaceDriver, shipId).filter((wp) => wp.collection === collection);
    }

    function addGroup(collection: string) {
        if (folders.has(collection)) return;
        const session = new Destructors();
        cleanup.add(session.destroy);

        const folder = pane.addFolder({ title: groupDisplayName(collection), expanded: false });
        session.add(() => folder.dispose());
        const refresh = () => {
            const group = members(collection);
            const selected = new Set([...selection.selectedItems]);
            folder.element.style.setProperty('--sw-dot', toCssColor(group[0]?.color ?? 0xffffff));
            const titleBar = folder.element.querySelector<HTMLElement>('.tp-fldv_b');
            if (titleBar) titleBar.dataset.count = `${group.length} WP`;
            folder.element.dataset.selected = `${group.length > 0 && group.every((wp) => selected.has(wp))}`;
        };
        folders.set(collection, { session, refresh });
        refresh();

        addInputBlade<string>(
            folder,
            {
                getValue: () => collection,
                onChange: () => () => undefined,
                setValue: (newName: string) => {
                    for (const wp of members(collection)) {
                        writeProp<string>(spaceDriver, `/Waypoint/${wp.id}/collection`).setValue(newName);
                    }
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
        ).element.classList.add('sw-ghost');
        addButton(
            folder,
            () =>
                spaceDriver.command(spaceCommands.bulkDeleteOrder, {
                    ids: members(collection).map((wp) => wp.id),
                }),
            { label: '', title: 'Delete group' },
            session.add,
        ).element.classList.add('sw-ghost');
    }

    function removeGroup(collection: string) {
        const entry = folders.get(collection);
        if (entry) {
            entry.session.destroy();
            folders.delete(collection);
        }
    }

    function refreshAll() {
        for (const entry of folders.values()) entry.refresh();
    }

    function watch(id: string) {
        if (watched.has(id)) return;
        const subs = [
            readProp<number>(spaceDriver, `/Waypoint/${id}/color`).onChange(refreshAll),
            readProp<string>(spaceDriver, `/Waypoint/${id}/collection`).onChange(refreshAll),
        ];
        watched.set(id, () => subs.forEach((unsub) => unsub()));
    }
    const onAdd = (e: Add) => {
        const id = WAYPOINT_PATH.exec(e.path)?.[1];
        if (id) watch(id);
        refreshAll();
    };
    const onRemove = (e: Remove) => {
        const id = WAYPOINT_PATH.exec(e.path)?.[1];
        if (id) {
            watched.get(id)?.();
            watched.delete(id);
        }
        refreshAll();
    };
    for (const wp of ownWaypoints(spaceDriver, shipId)) watch(wp.id);
    spaceDriver.events.on('$add', onAdd);
    spaceDriver.events.on('$remove', onRemove);
    selection.events.on('changed', refreshAll);
    cleanup.add(() => {
        spaceDriver.events.off('$add', onAdd);
        spaceDriver.events.off('$remove', onRemove);
        selection.events.off('changed', refreshAll);
        for (const unsub of watched.values()) unsub();
        watched.clear();
    });

    return { addGroup, removeGroup };
}
