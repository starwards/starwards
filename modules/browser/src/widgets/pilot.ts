import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../property-panel';
import { getShipDriver } from '../driver';

class PilotComponent {
    constructor(container: Container, p: Props) {
        void (async () => {
            const shipDriver = await getShipDriver(p.shipId);
            const panel = new PropertyPanel();
            panel.init(container);
            container.on('destroy', () => {
                panel.destroy();
            });

            panel.addText('rotationMode', shipDriver.rotationMode);
            panel.addProperty('smartPilotRotation', shipDriver.smartPilotRotation);
            panel.addProperty('rotation', shipDriver.rotation);
            panel.addText('maneuveringMode', shipDriver.maneuveringMode);
            panel.addProperty('smartPilotStrafe', shipDriver.smartPilotStrafe);
            panel.addProperty('smartPilotBoost', shipDriver.smartPilotBoost);
            panel.addProperty('strafe', shipDriver.strafe);
            panel.addProperty('boost', shipDriver.boost);

            panel.addProperty('energy', shipDriver.energy);
            panel.addProperty('reserveSpeed', shipDriver.reserveSpeed);
            panel.addProperty('useReserveSpeed', shipDriver.useReserveSpeed);
            panel.addProperty('antiDrift', shipDriver.antiDrift);
            panel.addProperty('breaks', shipDriver.breaks);
            panel.addProperty('turnSpeed', shipDriver.turnSpeed);
            panel.addProperty('angle', shipDriver.angle);
            panel.addProperty('speed direction', shipDriver['speed direction']);
            panel.addProperty('speed', shipDriver.speed);
            panel.addText('targeted', shipDriver.targeted);
        })();
    }
}

export type Props = { shipId: string };
export const pilotWidget: DashboardWidget<Props> = {
    name: 'pilot',
    type: 'component',
    component: PilotComponent,
    defaultProps: {},
};
