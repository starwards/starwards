import { addGraph, addTextBlade, createWidgetPane } from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
import { plugins as TweakpaneTablePlugin } from 'tweakpane-table';
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
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Engineering Status');
    pane.registerPlugin(TweakpaneTablePlugin);

    const ecrControl = readProp<boolean>(shipDriver, `/ecrControl`);
    addTextBlade(
        pane,
        ecrControl,
        { label: 'control', format: (isEcr) => (isEcr ? 'ECR' : 'Bridge') },
        panelCleanup.add,
    );

    const hullDamaged = readProp<boolean>(shipDriver, `/hullDamaged`);
    addTextBlade(
        pane,
        hullDamaged,
        { label: 'hull', format: (damaged) => (damaged ? 'DAMAGED' : 'OK') },
        panelCleanup.add,
    );

    const energy = readNumberProp(shipDriver, `/reactor/energy`);
    addGraph(pane, energy, { label: 'energy' }, panelCleanup.add);

    const afterBurnerFuel = readNumberProp(shipDriver, `/maneuvering/afterBurnerFuel`);
    addGraph(pane, afterBurnerFuel, { label: 'after-burner fuel' }, panelCleanup.add);
}
