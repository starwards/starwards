import { BindingApi } from '@tweakpane/core';
import { Container } from 'pixi.js';
import { Destructors } from '@starwards/core';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';
import { createPane } from '../panel';

/**
 * A "Layers" pane with one boolean blade per radar layer, toggling that layer's visibility.
 * Layers can be added and removed at runtime (e.g. one layer per waypoint group).
 */
export class RadarLayersPanel {
    private pane: Pane;
    private params: Record<string, boolean> = {};
    private bindings = new Map<string, BindingApi>();

    constructor(container: WidgetContainer) {
        const cleanup = new Destructors();
        container.on('destroy', cleanup.destroy);
        this.pane = createPane({ title: 'Layers', container: container.getElement().get(0) });
        cleanup.add(() => this.pane.dispose());
    }

    addLayer(name: string, layer: Container, onToggle?: (visible: boolean) => void) {
        if (this.bindings.has(name)) return;
        this.params[name] = layer.visible;
        const binding = this.pane.addBinding(this.params, name);
        binding.on('change', (ev) => {
            layer.visible = ev.value;
            onToggle?.(ev.value);
        });
        this.bindings.set(name, binding);
    }

    removeLayer(name: string) {
        const binding = this.bindings.get(name);
        if (binding) {
            binding.dispose();
            this.bindings.delete(name);
            delete this.params[name];
        }
    }
}
