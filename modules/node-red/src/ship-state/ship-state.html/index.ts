import { EditorNodeProperties, EditorRED } from 'node-red';

import { ShipStateOptions } from '../ship-state';

declare const RED: EditorRED;

export interface ShipStateEditorNodeProperties extends EditorNodeProperties, ShipStateOptions {}

RED.nodes.registerType<ShipStateEditorNodeProperties>('ship-state', {
    category: 'Starwards',
    color: '#d53434',
    defaults: {
        name: { value: '' },
        configNode: { value: '', type: 'starwards-config' },
        shipId: { value: '', required: true },
        pattern: { value: '**', required: true },
    },
    inputs: 0,
    outputs: 1,
    outputLabels: ['events'],
    icon: 'starwards-icon.png',
    paletteLabel: 'Ship in',
    label: function () {
        return (this.shipId || 'unnamed ship') + '|' + this.pattern;
    },
});
