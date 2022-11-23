import { EditorNodeProperties, EditorRED } from 'node-red';

import { ShipWriteOptions } from '../ship-write';

declare const RED: EditorRED;

export interface ShipStateEditorNodeProperties extends EditorNodeProperties, ShipWriteOptions {}

RED.nodes.registerType<ShipStateEditorNodeProperties>('ship-write', {
    category: 'Starwards',
    color: '#d53434',
    defaults: {
        name: { value: '' },
        configNode: { value: '', type: 'starwards-config' },
        shipId: { value: '', required: true },
    },
    inputs: 1,
    outputs: 0,
    inputLabels: 'command',
    icon: 'starwards-icon.png',
    paletteLabel: 'Ship Write',
    label: function () {
        return this.shipId || 'unnamed ship';
    },
});
