import { Destructors, ShipDriver } from '@starwards/core';
import { abstractOnChange, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';
import { addTextBlade } from '../panel';
import { defectReadProp } from '../react/hooks';

export function systemsStatusWidget(shipDriver: ShipDriver): DashboardWidget {
    class SystemsStatus {
        constructor(container: WidgetContainer, _: unknown) {
            drawSystemsStatus(container, shipDriver);
        }
    }

    return {
        name: 'systems status',
        type: 'component',
        component: SystemsStatus,
        defaultProps: {},
    };
}

export function drawSystemsStatus(container: WidgetContainer, shipDriver: ShipDriver, systems = shipDriver.systems) {
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Systems Status', container: container.getElement().get(0) });
    panelCleanup.add(() => {
        pane.dispose();
    });
    container.on('destroy', panelCleanup.destroy);
    for (const system of systems) {
        const brokenProp = readProp(shipDriver, `${system.pointer}/broken`);
        const defectibleProps = [brokenProp, ...system.defectibles.map(defectReadProp(shipDriver))];
        const getText = () => system.getStatus();
        const prop = {
            onChange: (cb: () => unknown) => abstractOnChange(defectibleProps, getText, cb),
            getValue: getText,
        };
        const guiController = addTextBlade(pane, prop, { label: system.state.name }, panelCleanup.add);
        guiController.element.classList.add('tp-rotv'); // This allows overriding tweakpane theme for this folder
        const applyThemeByStatus = () => (guiController.element.dataset.status = system.getStatus()); // this will change tweakpane theme for this folder, see tweakpane.css
        panelCleanup.add(abstractOnChange(defectibleProps, system.getStatus, applyThemeByStatus));
        applyThemeByStatus();
    }
}
