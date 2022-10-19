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
            panel.addProperty('rotationCommand', shipDriver.rotationCommand);
            panel.addProperty('rotation', shipDriver.rotation);
            panel.addText('maneuveringMode', {
                getValue: () => SmartPilotMode[shipDriver.state.smartPilot.maneuveringMode],
            });
            panel.addProperty('strafeCommand', shipDriver.strafeCommand);
            panel.addProperty('boostCommand', shipDriver.boostCommand);
            panel.addProperty('strafe', shipDriver.strafe);
            panel.addProperty('boost', shipDriver.boost);

            panel.addProperty('energy', shipDriver.energy);
            panel.addProperty('afterBurnerFuel', shipDriver.afterBurnerFuel);
            panel.addProperty('afterBurner', shipDriver.readWriteNumberProp(`/afterBurnerCommand`));
            panel.addProperty('antiDrift', shipDriver.readWriteNumberProp(`/antiDrift`));
            panel.addProperty('breaks', shipDriver.readWriteNumberProp(`/breaks`));
            panel.addProperty('turnSpeed', shipDriver.turnSpeed);
            panel.addProperty('angle', shipDriver.angle);
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
