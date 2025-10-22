import * as TweakpaneTablePlugin from 'tweakpane-table';

import { Destructors, ShipDriver } from '@starwards/core';
import { addGraph, addTextBlade, createPane } from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

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
    const pane = createPane({ title: 'Engineering Status', container: container.getElement().get(0) });
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
        panelCleanup.add,
    );

    const energy = readNumberProp(shipDriver, `/reactor/energy`);
    addGraph(pane, energy, { label: 'energy' }, panelCleanup.add);

    const afterBurnerFuel = readNumberProp(shipDriver, `/maneuvering/afterBurnerFuel`);
    addGraph(pane, afterBurnerFuel, { label: 'after-burner fuel' }, panelCleanup.add);
}
