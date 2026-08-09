import { PropertyPanel, addStatusTextBlade, createWidgetPane } from '../panel';
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

    panel.addProperty('energy', readNumberProp(shipDriver, `/reactor/energy`));
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
}

/**
 * `/reactor` isn't in `isPilotSystem`'s filtered systems table (see `station-system-filters.ts`),
 * so without a dedicated readout a starved reactor — thrusters unresponsive, no visible cause —
 * had nothing on the Pilot screen pointing at it (#2136). Drawn as its own widget (not folded into
 * `drawPilotStats`, which several gallery scenes snapshot) so this addition doesn't perturb those
 * baselines.
 */
export function drawReactorEnergyStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup } = createWidgetPane(container, 'Reactor');
    addStatusTextBlade(
        pane,
        readNumberProp(shipDriver, `/reactor/energy`),
        { label: 'energy' },
        (energy) => (energy !== undefined && energy <= 0 ? 'ERROR' : 'OK'),
        cleanup.add,
    );
}
