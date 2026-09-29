import { ShipDriver, SmartPilotMode, TargetedStatus } from '@starwards/core';
import {
    addBarBlade,
    addBipolarBarBlade,
    addInputBlade,
    addTextBlade,
    applyThresholdTheme,
    createWidgetPane,
} from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

export function helmsWidget(shipDriver: ShipDriver): DashboardWidget {
    class HelmsComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawHelmsStats(container, shipDriver);
        }
    }
    return {
        name: 'helms',
        type: 'component',
        component: HelmsComponent,
        defaultProps: {},
    };
}

export function drawHelmsStats(container: WidgetContainer, shipDriver: ShipDriver) {
    drawFlight(container, shipDriver);
    drawModes(container, shipDriver);
    drawCommand(container, shipDriver);
    drawFuel(container, shipDriver);
}

function drawFlight(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Flight');
    addTextBlade(
        pane,
        readNumberProp(shipDriver, `/spaceship/angle`),
        { label: 'HDG °', format: (a: number) => String(Math.round(a)).padStart(3, '0') },
        cleanup.add,
    );
    addTextBlade(
        pane,
        readNumberProp(shipDriver, `/speed`),
        { label: 'SPD m/s', format: (v: number) => v.toFixed(2) },
        cleanup.add,
    );
    addTextBlade(
        pane,
        readNumberProp(shipDriver, `/spaceship/turnSpeed`),
        { label: 'TURN °/s', format: (v: number) => v.toFixed(1) },
        cleanup.add,
    );
}

function drawModes(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Modes');
    const modeFormat = (m: SmartPilotMode) => SmartPilotMode[m];
    addTextBlade(
        pane,
        readProp<SmartPilotMode>(shipDriver, '/smartPilot/rotationMode'),
        { label: 'rotation', format: modeFormat },
        cleanup.add,
    );
    addTextBlade(
        pane,
        readProp<SmartPilotMode>(shipDriver, '/smartPilot/maneuveringMode'),
        { label: 'maneuver', format: modeFormat },
        cleanup.add,
    );
    addTextBlade(
        pane,
        readProp<TargetedStatus>(shipDriver, '/targeted'),
        { label: 'target', format: (t: TargetedStatus) => TargetedStatus[t] },
        cleanup.add,
    );
}

function drawCommand(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Command');
    addBipolarBarBlade(pane, readNumberProp(shipDriver, '/smartPilot/rotation'), { label: 'rotate' }, cleanup.add);
    addBipolarBarBlade(pane, readNumberProp(shipDriver, '/smartPilot/maneuvering/y'), { label: 'strafe' }, cleanup.add);
    addBipolarBarBlade(pane, readNumberProp(shipDriver, '/smartPilot/maneuvering/x'), { label: 'boost' }, cleanup.add);
    for (const [label, pointer] of [
        ['burner', '/afterBurnerCommand'],
        ['anti-drift', '/antiDrift'],
        ['brakes', '/breaks'],
    ] as const) {
        const { getValue, onChange } = readNumberProp(shipDriver, pointer);
        const engaged = () => {
            const value = getValue();
            return value === undefined ? undefined : value > 0;
        };
        addInputBlade(pane, { onChange, getValue: engaged }, { label }, cleanup.add);
    }
}

function drawFuel(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Fuel');
    const energy = readNumberProp(shipDriver, `/reactor/energy`);
    const energyBar = addBarBlade(
        pane,
        energy,
        { label: 'energy', format: (e: number) => Math.round(e).toString() },
        cleanup.add,
    );
    // a healthy-looking Systems Status panel doesn't explain why boost/thrusters do nothing when
    // the reactor is nearly dry — this makes the shortfall itself obvious, right where the pilot looks.
    // A starved reactor rarely sits at a literal 0 — it's fighting a constant tiny recharge
    // against constant draw — so ERROR needs a "critically low" band, not an exact-zero check
    applyThresholdTheme(energyBar.element, energy, energy.range[1] * 0.25, energy.range[1] * 0.05, cleanup.add);
    addBarBlade(
        pane,
        readNumberProp(shipDriver, `/maneuvering/afterBurnerFuel`),
        { label: 'afterburner', format: (f: number) => Math.round(f).toString() },
        cleanup.add,
    );
}
