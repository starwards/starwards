import { Destructors, ShipDriver } from '@starwards/core';
import { abstractOnChange, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';
import { addTextBlade } from '../panel';
import { defectReadProp } from '../react/hooks';

export function systemsStatusWidget(shipDriver: ShipDriver): DashboardWidget {
    class SystemsStatus {
        private pane: Pane;
        private panelCleanup = new Destructors();
        constructor(container: WidgetContainer, _: unknown) {
            this.pane = new Pane({ container: container.getElement().get(0) });
            this.panelCleanup.add(() => {
                this.pane.dispose();
            });
            container.on('destroy', this.panelCleanup.destroy);

            for (const system of shipDriver.systems) {
                const brokenProp = readProp(shipDriver, `${system.pointer}/broken`);
                const defectibleProps = [brokenProp, ...system.defectibles.map(defectReadProp(shipDriver))];
                const getText = () => system.getStatus();
                const prop = {
                    onChange: (cb: () => unknown) => abstractOnChange(defectibleProps, getText, cb),
                    getValue: getText,
                };
                const guiController = addTextBlade(
                    this.pane,
                    prop,
                    { label: system.state.name },
                    this.panelCleanup.add
                );
                // This allows overriding tweakpane theme for this folder
                guiController.element.classList.add('tp-rotv');
                const applyThemeByStatus = () => (guiController.element.dataset.status = system.getStatus());
                this.panelCleanup.add(abstractOnChange(defectibleProps, system.getStatus, applyThemeByStatus));
                applyThemeByStatus();
            }
        }
    }

    return {
        name: 'systems status',
        type: 'component',
        component: SystemsStatus,
        defaultProps: {},
    };
}
