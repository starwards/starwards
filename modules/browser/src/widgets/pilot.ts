import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getShipRoom } from '../client';
import { PropertyPanel } from '../property-panel';
import { shipProperties } from '../ship-properties';
import { DashboardWidget } from './dashboard';

function pilotComponent(container: Container, p: Props) {
    void (async () => {
        const shipRoom = await getShipRoom(p.shipId);
        const viewModelChanges = new EventEmitter();
        const panel = new PropertyPanel(viewModelChanges);
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });
        const properties = shipProperties(shipRoom);

        panel.addText(properties['smartPilot.rotationMode']);
        panel.addProperty(properties['smartPilot.rotation']);
        panel.addProperty(properties.rotation);
        panel.addText(properties['smartPilot.maneuveringMode']);
        shipRoom.state.events.on('smartPilot.maneuvering', () => {
            viewModelChanges.emit('smartPilot.boost');
            viewModelChanges.emit('smartPilot.strafe');
        });
        panel.addProperty(properties['smartPilot.strafe']);
        panel.addProperty(properties['smartPilot.boost']);
        panel.addProperty(properties.strafe);
        panel.addProperty(properties.boost);

        panel.addProperty(properties.energy);
        panel.addProperty(properties.reserveSpeed);
        panel.addProperty(properties.useReserveSpeed);
        panel.addProperty(properties.antiDrift);
        panel.addProperty(properties.breaks);
        panel.addProperty(properties.turnSpeed);
        panel.addProperty(properties.angle);
        panel.addProperty(properties['speed direction']);
        panel.addProperty(properties.speed);
        panel.addText(properties.targeted);

        for (const eventName of viewModelChanges.eventNames()) {
            shipRoom.state.events.on(eventName, () => viewModelChanges.emit(eventName));
        }
        shipRoom.state.events.on('velocity', () => {
            viewModelChanges.emit('speed');
            viewModelChanges.emit('speed direction');
        });
    })();
}

export type Props = { shipId: string };
export const pilotWidget: DashboardWidget<Props> = {
    name: 'pilot',
    type: 'component',
    component: pilotComponent,
    defaultProps: {},
};
