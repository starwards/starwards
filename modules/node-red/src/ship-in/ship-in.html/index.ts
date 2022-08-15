import { EditorNodeProperties, EditorRED } from 'node-red';

import { ShipInOptions } from '../ship-in';

declare const RED: EditorRED;

export interface ShipInEditorNodeProperties extends EditorNodeProperties, ShipInOptions {}

RED.nodes.registerType<ShipInEditorNodeProperties>('ship-in', {
    category: 'Starwards',
    color: '#d53434',
    defaults: {
        name: { value: '' },
        configNode: { value: '', type: 'starwards-config' },
        shipId: { value: '', required: true },
        pattern: { value: '**', required: true },
        checkEvery: {
            value: 1000,
            validate: (v: string) => v !== '' && Number(v) > 0,
        },
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
