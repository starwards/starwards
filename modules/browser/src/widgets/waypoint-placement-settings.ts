import { addColorBlade, createPane } from '../panel';

import { Destructors } from '@starwards/core';
import EventEmitter from 'eventemitter3';
import { SpaceDriver } from '@starwards/core';
import { WidgetContainer } from '../container';
import { addGroupComboBlade } from './waypoint-group-picker';

type PlacementSettings = {
    collection: string;
    color: number;
};

type PlacementSettingsPanel = {
    getSettings: () => PlacementSettings;
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
    cleanup.add(() => pane.dispose());

    addGroupComboBlade(pane, model('collection'), 'group', spaceDriver, shipId, cleanup.add);
    addColorBlade(pane, model('color'), { label: 'color' }, cleanup.add);

    return { getSettings: () => ({ ...settings }) };
}
