import * as ItemListPlugin from 'tweakpane4-item-list-plugin';

import { Container } from 'pixi.js';
import { Destructors } from '@starwards/core';
import { WidgetContainer } from '../container';
import { createPane } from '../panel';

/**
 * A "Layers" pane using the tweakpane4-item-list-plugin blade: the item list holds the
 * visible radar layers. Removing an item (✕) hides that layer; re-adding it from the
 * dropdown shows it again.
 */
export function drawRadarLayers(container: WidgetContainer, layers: Record<string, Container>) {
    const cleanup = new Destructors();
    container.on('destroy', cleanup.destroy);

    const pane = createPane({ title: 'Layers', container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());
    pane.registerPlugin(ItemListPlugin);

    const names = Object.keys(layers);
    const params = { layers: [...names] };
    const binding = pane.addBinding(params, 'layers', {
        view: 'item-list',
        options: names,
        pickText: 'Show layer…',
        emptyText: 'All layers hidden',
    });
    binding.on('change', () => {
        for (const name of names) {
            layers[name].visible = params.layers.includes(name);
        }
    });
    return pane;
}
