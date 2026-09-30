import { Destructor, SpaceDriver } from '@starwards/core';
import { addButton, addColorBlade, createWidgetPane } from '../panel';

import EventEmitter from 'eventemitter3';
import { WidgetContainer } from '../container';
import { addGroupComboBlade } from './waypoint-group-picker';

const SWATCHES = [
    { name: 'Cyan', color: 0x5fe3f0 },
    { name: 'White', color: 0xffffff },
    { name: 'Amber', color: 0xffb000 },
    { name: 'Red', color: 0xff3b30 },
    { name: 'Violet', color: 0x6a5cff },
];

function addSwatchRow(
    before: { element: HTMLElement },
    model: { getValue: () => number; setValue: (v: number) => void; onChange: (cb: () => unknown) => Destructor },
    cleanup: (d: Destructor) => void,
) {
    const row = document.createElement('div');
    row.className = 'sw-swatches';
    const buttons = SWATCHES.map(({ name, color }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sw-swatch';
        button.title = name;
        button.setAttribute('aria-label', name);
        button.style.background = `#${color.toString(16).padStart(6, '0')}`;
        button.addEventListener('click', () => model.setValue(color));
        row.append(button);
        return { button, color };
    });
    const sync = () => {
        for (const { button, color } of buttons) button.setAttribute('aria-pressed', `${model.getValue() === color}`);
    };
    sync();
    cleanup(model.onChange(sync));
    before.element.before(row);
    cleanup(() => row.remove());
}

type PlacementSettings = {
    collection: string;
    color: number;
};

type PlacementSettingsPanel = {
    getSettings: () => PlacementSettings;
};

/**
 * Settings for waypoints placed from the dradis radar (client-side only): the group
 * ("collection") they are created in — an existing one or a newly typed name — and their color.
 */
export function drawPlacementSettings(
    container: WidgetContainer,
    spaceDriver: SpaceDriver,
    shipId: string,
    togglePlacement: () => unknown,
): PlacementSettingsPanel {
    const { pane, cleanup } = createWidgetPane(container, 'New Waypoint');

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

    addGroupComboBlade(pane, model('collection'), 'group', spaceDriver, shipId, cleanup.add);
    addColorBlade(pane, model('color'), { label: 'color' }, cleanup.add);
    const placeButton = addButton(pane, togglePlacement, { label: '', title: 'Place Waypoint' }, cleanup.add);
    addSwatchRow(placeButton, model('color'), cleanup.add);
    const hint = document.createElement('div');
    hint.className = 'sw-hint';
    hint.textContent = 'CLICK MAP TO DROP · ESC CANCELS';
    placeButton.element.after(hint);
    cleanup.add(() => hint.remove());

    return { getSettings: () => ({ ...settings }) };
}
