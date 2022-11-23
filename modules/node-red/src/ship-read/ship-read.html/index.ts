import { EditorNodeProperties, EditorRED } from 'node-red';

import { ShipReadOptions } from '../ship-read';

declare const RED: EditorRED;

export interface ShipStateEditorNodeProperties extends EditorNodeProperties, ShipReadOptions {}

RED.nodes.registerType<ShipStateEditorNodeProperties>('ship-read', {
    category: 'Starwards',
    color: '#d53434',
    defaults: {
        name: { value: '' },
        configNode: { value: '', type: 'starwards-config' },
        shipId: { value: '', required: true },
        listenPattern: { value: '' },
    },
    inputs: 1,
    outputs: 1,
    inputLabels: 'query',
    outputLabels: ['event'],
    icon: 'starwards-icon.png',
    paletteLabel: 'Ship Read',
    label: function () {
        return (this.shipId || 'unnamed ship') + (this.listenPattern ? '|' + this.listenPattern : '');
    },
});
