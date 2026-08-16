import { addGraph, addTextBlade, addThresholdTextBlade, createWidgetPane } from '../panel';
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

    const hullDamaged = readProp<boolean>(shipDriver, `/hullDamaged`);
    addTextBlade(
        pane,
        hullDamaged,
        { label: 'hull', format: (damaged) => (damaged ? 'DAMAGED' : 'OK') },
        panelCleanup.add,
    );

    const energy = readNumberProp(shipDriver, `/reactor/energy`);
    addGraph(pane, energy, { label: 'energy' }, panelCleanup.add);
    // a healthy-looking status panel elsewhere (broken/damaged only) hides that a system is doing
    // nothing this tick purely because the reactor ran dry — this makes the shortfall itself obvious
    addThresholdTextBlade(
        pane,
        energy,
        {
            label: 'energy level',
            format: (e: number) => Math.round(e).toString(),
            // a starved reactor rarely sits at a literal 0 — it's fighting a constant tiny recharge
            // against constant draw — so ERROR needs a "critically low" band, not an exact-zero check
            warnBelow: energy.range[1] * 0.25,
            errorAt: energy.range[1] * 0.05,
        },
        panelCleanup.add,
    );

    const energyCells = readNumberProp(shipDriver, `/reactor/energyCells`);
    addTextBlade(
        pane,
        energyCells,
        { label: 'energy cells', format: (cells) => `${cells}/${shipDriver.state.reactor.design.maxEnergyCells}` },
        panelCleanup.add,
    );

    const afterBurnerFuel = readNumberProp(shipDriver, `/maneuvering/afterBurnerFuel`);
    addGraph(pane, afterBurnerFuel, { label: 'after-burner fuel' }, panelCleanup.add);
}
