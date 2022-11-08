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
    },
    inputs: 1,
    outputs: 1,
    inputLabels: 'command or query',
    outputLabels: ['event'],
    icon: 'starwards-icon.png',
    paletteLabel: 'Ship State',
    label: function () {
        return (this.shipId || 'unnamed ship') + (this.listenPattern ? '|' + this.listenPattern : '');
    },
});
