import * as SearchListPlugin from 'tweakpane4-search-list-plugin';

import { addColorBlade, addInputBlade, createPane } from '../panel';

import { Destructors } from '@starwards/core';
import EventEmitter from 'eventemitter3';
import { SpaceDriver } from '@starwards/core';
import { WidgetContainer } from '../container';
import { addGroupPickerBlade } from './waypoint-group-picker';

export type PlacementSettings = {
    collection: string;
    color: number;
};

export type PlacementSettingsPanel = {
    getSettings: () => PlacementSettings;
    refreshGroups: () => void;
};

/**
 * Settings for waypoints placed from the relay radar (client-side only): the group
 * ("collection") they are created in — an existing one or a newly typed name — and their color.
 */
export function drawPlacementSettings(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipId: string,
): PlacementSettingsPanel {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    const settings: PlacementSettings = { collection: '', color: 0xffffff };
    const events = new EventEmitter<'changed'>();
    const model = <K extends keyof PlacementSettings>(key: K) => ({
        getValue: () => settings[key],
        setValue: (v: PlacementSettings[K]) => {
            settings[key] = v;
            events.emit('changed');
        },
        onChange: (cb: () => unknown) => {
            events.on('changed', cb);
            return () => events.off('changed', cb);
        },
    });

    const pane = createPane({ title: 'New Waypoint', container: container.getElement().get(0) });
    pane.registerPlugin(SearchListPlugin);
    cleanup.add(() => pane.dispose());

    addInputBlade<string>(pane, model('collection'), { label: 'group' }, cleanup.add);
    addColorBlade(pane, model('color'), { label: 'color' }, cleanup.add);

    // searchable picker of existing groups feeding the group field; rebuilt when the group set changes
    let groupsPicker: Destructors | null = null;
    function refreshGroups() {
        groupsPicker?.destroy();
        groupsPicker = new Destructors();
        cleanup.add(groupsPicker.destroy);
        addGroupPickerBlade(pane, model('collection'), 'existing', spaceDriver, shipId, groupsPicker.add);
    }
    refreshGroups();

    return { getSettings: () => ({ ...settings }), refreshGroups };
}
