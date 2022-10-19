import { ShipDriver, SmartPilotMode } from '@starwards/core';

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
            panel.addProperty('rotationCommand', shipDriver.readWriteNumberProp(`/smartPilot/rotation`));
            panel.addProperty('rotation', shipDriver.readNumberProp(`/rotation`));
            panel.addText('maneuveringMode', {
                getValue: () => SmartPilotMode[shipDriver.state.smartPilot.maneuveringMode],
            });
            panel.addProperty('strafeCommand', shipDriver.readWriteNumberProp('/smartPilot/maneuvering/y'));
            panel.addProperty('boostCommand', shipDriver.readWriteNumberProp('/smartPilot/maneuvering/x'));
            panel.addProperty('strafe', shipDriver.readNumberProp(`/strafe`));
            panel.addProperty('boost', shipDriver.readNumberProp(`/boost`));

            panel.addProperty('energy', shipDriver.readNumberProp(`/reactor/energy`));
            panel.addProperty('afterBurnerFuel', shipDriver.readNumberProp(`/reactor/afterBurnerFuel`));
            panel.addProperty('afterBurner', shipDriver.readWriteNumberProp(`/afterBurnerCommand`));
            panel.addProperty('antiDrift', shipDriver.readWriteNumberProp(`/antiDrift`));
            panel.addProperty('breaks', shipDriver.readWriteNumberProp(`/breaks`));
            panel.addProperty('turnSpeed', shipDriver.readNumberProp(`/turnSpeed`));
            panel.addProperty('angle', shipDriver.readWriteNumberProp(`/angle`));
            panel.addProperty('speedDirection', shipDriver.readNumberProp(`/velocityAngle`));
            panel.addProperty('speed', shipDriver.readNumberProp(`/speed`));
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
