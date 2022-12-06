import { ShipDriver, SmartPilotMode } from '@starwards/core';

import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../panel';
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
    panel.addProperty('afterBurnerFuel', readNumberProp(shipDriver, `/reactor/afterBurnerFuel`));

    panel.addProperty('heading', readNumberProp(shipDriver, `/angle`));
    panel.addProperty('speed', readNumberProp(shipDriver, `/speed`));
    panel.addProperty('turn speed', readNumberProp(shipDriver, `/turnSpeed`));

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
