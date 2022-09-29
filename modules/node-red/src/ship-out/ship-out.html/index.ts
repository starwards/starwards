import { EditorNodeProperties, EditorRED } from 'node-red';

import { ShipOutOptions } from '../ship-out';

declare const RED: EditorRED;

export interface ShipOutEditorNodeProperties extends EditorNodeProperties, ShipOutOptions {}

RED.nodes.registerType<ShipOutEditorNodeProperties>('ship-out', {
    category: 'Starwards',
    color: '#d53434',
    defaults: {
        name: { value: '' },
        configNode: { value: '', type: 'starwards-config' },
        shipId: { value: '', required: true },
    },
    inputs: 1,
    outputs: 0,
    outputLabels: ['commands'],
    icon: 'starwards-icon.png',
    paletteLabel: 'Ship out',
    label: function () {
        return this.shipId || 'unnamed ship';
    },
});
