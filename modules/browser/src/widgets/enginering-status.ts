import { addBarBlade, addSegmentedBarBlade, addTextBlade, applyThresholdTheme, createWidgetPane } from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
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

/**
 * Levels are bars, not graphs: a bar states the level the engineer must act on right now, and a
 * trace over time would only add history the pane has no room to read.
 */
export function drawEngineeringStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Reactor');

    const energy = readNumberProp(shipDriver, `/reactor/energy`);
    const energyBar = addBarBlade(
        pane,
        energy,
        { label: 'energy', format: (e: number) => Math.round(e).toString() },
        panelCleanup.add,
    );
    energyBar.element.classList.add('sw-big');
    // a healthy-looking status panel elsewhere (broken/damaged only) hides that a system is doing
    // nothing this tick purely because the reactor ran dry — this makes the shortfall itself obvious
    // a starved reactor rarely sits at a literal 0 — it's fighting a constant tiny recharge
    // against constant draw — so ERROR needs a "critically low" band, not an exact-zero check
    applyThresholdTheme(energyBar.element, energy, energy.range[1] * 0.25, energy.range[1] * 0.05, panelCleanup.add);

    const energyCells = readNumberProp(shipDriver, `/reactor/energyCells`);
    const maxCells = shipDriver.state.reactor.design.maxEnergyCells;
    addTextBlade(pane, energyCells, { label: 'cells', format: (cells) => `${cells}/${maxCells}` }, panelCleanup.add);
    addSegmentedBarBlade(pane, energyCells, panelCleanup.add, maxCells);

    addBarBlade(
        pane,
        readNumberProp(shipDriver, `/maneuvering/afterBurnerFuel`),
        { label: 'afterburner fuel', format: (f: number) => Math.round(f).toString() },
        panelCleanup.add,
    );

    addTextBlade(
        pane,
        readProp<boolean>(shipDriver, `/hullDamaged`),
        { label: 'hull', format: (damaged) => (damaged ? 'DAMAGED' : 'INTACT') },
        panelCleanup.add,
    ).element.classList.add('sw-mode');
}
