import { ShipDriver, SmartPilotMode } from '@starwards/core';
import { readNumberProp, readWriteNumberProp } from '../property-wrappers';

import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../panel';

export function pilotWidget(shipDriver: ShipDriver): DashboardWidget {
    class PilotComponent {
        constructor(container: Container, _: unknown) {
            const panel = new PropertyPanel(container);
            container.on('destroy', () => {
                panel.destroy();
            });

            panel.addText('rotationMode', { getValue: () => SmartPilotMode[shipDriver.state.smartPilot.rotationMode] });
            panel.addProperty('rotationCommand', readWriteNumberProp(shipDriver, `/smartPilot/rotation`));
            panel.addProperty('rotation', readNumberProp(shipDriver, `/rotation`));
            panel.addText('maneuveringMode', {
                getValue: () => SmartPilotMode[shipDriver.state.smartPilot.maneuveringMode],
            });
            panel.addProperty('strafeCommand', readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/y'));
            panel.addProperty('boostCommand', readWriteNumberProp(shipDriver, '/smartPilot/maneuvering/x'));
            panel.addProperty('strafe', readNumberProp(shipDriver, `/strafe`));
            panel.addProperty('boost', readNumberProp(shipDriver, `/boost`));

            panel.addProperty('energy', readNumberProp(shipDriver, `/reactor/energy`));
            panel.addProperty('afterBurnerFuel', readNumberProp(shipDriver, `/reactor/afterBurnerFuel`));
            panel.addProperty('afterBurner', readWriteNumberProp(shipDriver, `/afterBurnerCommand`));
            panel.addProperty('antiDrift', readWriteNumberProp(shipDriver, `/antiDrift`));
            panel.addProperty('breaks', readWriteNumberProp(shipDriver, `/breaks`));
            panel.addProperty('turnSpeed', readNumberProp(shipDriver, `/turnSpeed`));
            panel.addProperty('angle', readWriteNumberProp(shipDriver, `/angle`));
            panel.addProperty('speedDirection', readNumberProp(shipDriver, `/velocityAngle`));
            panel.addProperty('speed', readNumberProp(shipDriver, `/speed`));
            panel.addText('targeted', { getValue: () => String(shipDriver.state.targeted) });
        }
    }
    return {
        name: 'pilot',
        type: 'component',
        component: PilotComponent,
        defaultProps: {},
    };
}
