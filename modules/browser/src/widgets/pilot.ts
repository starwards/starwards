import { PropertyPanel, addThresholdTextBlade, createWidgetPane } from '../panel';
import { ShipDriver, SmartPilotMode } from '@starwards/core';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
import { readNumberProp } from '../property-wrappers';

export function pilotWidget(shipDriver: ShipDriver): DashboardWidget {
    class PilotComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawPilotStats(container, shipDriver);
        }
    }
    return {
        name: 'pilot',
        type: 'component',
        component: PilotComponent,
        defaultProps: {},
    };
}

export function drawPilotStats(container: WidgetContainer, shipDriver: ShipDriver) {
    const panel = new PropertyPanel(container);
    container.on('destroy', () => {
        panel.destroy();
    });

    const energy = readNumberProp(shipDriver, `/reactor/energy`);
    panel.addProperty('energy', energy);
    panel.addProperty('afterBurnerFuel', readNumberProp(shipDriver, `/maneuvering/afterBurnerFuel`));

    panel.addProperty('heading', readNumberProp(shipDriver, `/spaceship/angle`));
    panel.addProperty('speed', readNumberProp(shipDriver, `/speed`));
    panel.addProperty('turn speed', readNumberProp(shipDriver, `/spaceship/turnSpeed`));

    panel.addText('rotationMode', { getValue: () => SmartPilotMode[shipDriver.state.smartPilot.rotationMode] });
    panel.addProperty('rotationCommand', readNumberProp(shipDriver, `/smartPilot/rotation`));
    panel.addProperty('rotation', readNumberProp(shipDriver, `/rotation`));
    panel.addText('maneuveringMode', {
        getValue: () => SmartPilotMode[shipDriver.state.smartPilot.maneuveringMode],
    });
    panel.addProperty('strafeCommand', readNumberProp(shipDriver, '/smartPilot/maneuvering/y'));
    panel.addProperty('boostCommand', readNumberProp(shipDriver, '/smartPilot/maneuvering/x'));
    panel.addProperty('strafe', readNumberProp(shipDriver, `/strafe`));
    panel.addProperty('boost', readNumberProp(shipDriver, `/boost`));

    panel.addProperty('afterBurner', readNumberProp(shipDriver, `/afterBurnerCommand`));
    panel.addProperty('antiDrift', readNumberProp(shipDriver, `/antiDrift`));
    panel.addProperty('breaks', readNumberProp(shipDriver, `/breaks`));
    panel.addText('targeted', { getValue: () => String(shipDriver.state.targeted) });

    // a healthy-looking Systems Status panel doesn't explain why boost/thrusters do nothing when
    // the reactor is nearly dry — this makes the shortfall itself obvious, right where the pilot looks
    const { pane: reactorPane, cleanup: reactorCleanup } = createWidgetPane(container, 'Reactor');
    addThresholdTextBlade(
        reactorPane,
        energy,
        {
            label: 'energy level',
            format: (e: number) => Math.round(e).toString(),
            // a starved reactor rarely sits at a literal 0 — it's fighting a constant tiny recharge
            // against constant draw — so ERROR needs a "critically low" band, not an exact-zero check
            warnBelow: energy.range[1] * 0.25,
            errorAt: energy.range[1] * 0.05,
        },
        reactorCleanup.add,
    );
}
