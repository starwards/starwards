import * as TweakpaneTablePlugin from 'tweakpane-table';

import { Destructors, ShipDriver } from '@starwards/core';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';
import { addTextBlade } from '../panel';
import { readProp } from '../property-wrappers';

export function engineeringStatusWidget(shipDriver: ShipDriver): DashboardWidget {
    class EngineeringStatus {
        constructor(container: WidgetContainer, _: unknown) {
            drawEngineeringStatus(container, shipDriver);
        }
    }

    return {
        name: 'engineering status',
        type: 'component',
        component: EngineeringStatus,
        defaultProps: {},
    };
}

export function drawEngineeringStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Engineering Status', container: container.getElement().get(0) });
    pane.registerPlugin(TweakpaneTablePlugin);
    panelCleanup.add(() => {
        pane.dispose();
    });
    container.on('destroy', panelCleanup.destroy);

    const ecrControl = readProp<boolean>(shipDriver, `/ecrControl`);
    addTextBlade(
        pane,
        ecrControl,
        { label: 'control', format: (isEcr) => (isEcr ? 'ECR' : 'Bridge') },
        panelCleanup.add
    );
}
