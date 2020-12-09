import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../property-panel';
import { getShipRoom } from '../client';
import { shipProperties } from '../ship-properties';

function pilotComponent(container: Container, p: Props) {
    void (async () => {
        const shipRoom = await getShipRoom(p.shipId);
        const panel = new PropertyPanel();
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });
        const properties = shipProperties(shipRoom);

        panel.addText('rotationMode', properties['smartPilot.rotationMode']);
        panel.addProperty('smartPilot.rotation', properties['smartPilot.rotation']);
        panel.addProperty('rotation', properties.rotation);
        panel.addText('maneuveringMode', properties['smartPilot.maneuveringMode']);
        panel.addProperty('smartPilot.strafe', properties['smartPilot.strafe']);
        panel.addProperty('smartPilot.boost', properties['smartPilot.boost']);
        panel.addProperty('strafe', properties.strafe);
        panel.addProperty('boost', properties.boost);

        panel.addProperty('energy', properties.energy);
        panel.addProperty('reserveSpeed', properties.reserveSpeed);
        panel.addProperty('useReserveSpeed', properties.useReserveSpeed);
        panel.addProperty('antiDrift', properties.antiDrift);
        panel.addProperty('breaks', properties.breaks);
        panel.addProperty('turnSpeed', properties.turnSpeed);
        panel.addProperty('angle', properties.angle);
        panel.addProperty('speed direction', properties['speed direction']);
        panel.addProperty('speed', properties.speed);
        panel.addText('targeted', properties.targeted);
    })();
}

export type Props = { shipId: string };
export const pilotWidget: DashboardWidget<Props> = {
    name: 'pilot',
    type: 'component',
    component: pilotComponent,
    defaultProps: {},
};
