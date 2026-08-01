import { Destructors } from '@starwards/core';
import { Pane } from 'tweakpane';
import { createPane } from './blades';

/**
 * The lifecycle surface `createWidgetPane` needs. Satisfied by both `WidgetContainer` and
 * golden-layout's `Container`.
 */
type PaneContainer = {
    on(type: 'destroy', listener: () => unknown): unknown;
    getElement(): JQuery<HTMLElement>;
};

/**
 * Creates a widget's pane inside its container and ties the two lifecycles together: the returned
 * `cleanup` runs when the container is destroyed, and disposing the pane is already registered on it.
 *
 * Call this at the point the pane should be created — creation order matters. Fixed-position panes
 * have unbounded height, so later-appended DOM covers earlier panes; a pane that must receive clicks
 * has to be created last.
 */
export function createWidgetPane(container: PaneContainer, title: string): { pane: Pane; cleanup: Destructors } {
    const cleanup = new Destructors();
    const pane = createPane({ title, container: container.getElement().get(0) });
    cleanup.add(() => pane.dispose());
    container.on('destroy', cleanup.destroy);
    return { pane, cleanup };
}
