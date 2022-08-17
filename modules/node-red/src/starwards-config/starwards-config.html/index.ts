import { EditorNodeProperties, EditorRED } from 'node-red';

import { StarwardsConfigOptions } from '../starwards-config';

declare const RED: EditorRED;

export interface StarwardsConfigEditorNodeProperties extends EditorNodeProperties, StarwardsConfigOptions {}

RED.nodes.registerType<StarwardsConfigEditorNodeProperties>('starwards-config', {
    category: 'config',
    defaults: {
        name: { value: '' },
        url: {
            value: 'http://host.docker.internal/',
            required: true,
            validate: (val) => {
                try {
                    new URL(val);
                    return true;
                } catch (e) {
                    return false;
                }
            },
        },
    },
    label: function () {
        return this.name || 'Starwards @' + this.url;
    },
});
