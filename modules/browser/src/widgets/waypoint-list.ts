import * as ItemListPlugin from 'tweakpane4-item-list-plugin';

import { Add, Remove } from 'colyseus-events';
import { Destructors, SpaceDriver, Waypoint, spaceCommands } from '@starwards/core';

import { BindingApi } from '@tweakpane/core';
import { SelectionContainer } from '../radar/selection-container';
import { WidgetContainer } from '../container';
import { createPane } from '../panel';
import { readProp } from '../property-wrappers';

function wpTitle(title: string | undefined, id: string): string {
    return title || id.slice(0, 6);
}

function wpLabel(title: string | undefined, id: string): string {
    return `${wpTitle(title, id)} (${id.slice(0, 6)})`;
}

/**
 * Waypoints pane built on the tweakpane4-item-list-plugin blade: every owned waypoint is an
 * item row (✕ deletes it), and picking a waypoint from the dropdown selects it on the radar
 * (opening it in the Edit Waypoint pane).
 */
export function drawWaypointList(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipId: string,
    selection: SelectionContainer,
) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    // Bound the panel so a long waypoint list scrolls instead of growing over other panels
    container.getElement().css({ 'max-height': '35vh', 'overflow-y': 'auto', 'overflow-x': 'hidden' });

    const pane = createPane({ title: 'Waypoints', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());
    pane.registerPlugin(ItemListPlugin);

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

        const labelToWp = new Map<string, Waypoint>();
        const labels: string[] = [];
        for (const wp of ownWaypoints()) {
            const titleProp = readProp<string>(spaceDriver, `/Waypoint/${wp.id}/title`);
            listSubscriptions.add(titleProp.onChange(rebuildList));
            const label = wpLabel(titleProp.getValue(), wp.id);
            labelToWp.set(label, wp);
            labels.push(label);
        }

        const params = { waypoints: [...labels] };
        listBinding = pane.addBinding(params, 'waypoints', {
            index: 0,
            view: 'item-list',
            options: labels,
            pickText: 'Select waypoint…',
            emptyText: 'No waypoints',
            onOptionClick: (label: string) => {
                const wp = labelToWp.get(label);
                if (wp) selection.set([wp]);
                return false; // selection only — never add duplicates to the list
            },
        });
        listBinding.on('change', () => {
            // an item removed via ✕ is a delete order for that waypoint
            const remaining = new Set(params.waypoints);
            const ids = labels
                .filter((label) => !remaining.has(label))
                .map((label) => labelToWp.get(label)?.id)
                .filter((id): id is string => !!id);
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
        if (waypointPath.test(e.path)) rebuildList();
    };

    spaceDriver.events.on('$add', onAdd);
    spaceDriver.events.on('$remove', onRemove);
    cleanup.add(() => {
        spaceDriver.events.off('$add', onAdd);
        spaceDriver.events.off('$remove', onRemove);
    });

    return pane;
}
