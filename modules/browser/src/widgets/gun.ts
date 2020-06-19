import { Container } from 'golden-layout';
import { getRoomById } from '../client';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';
import EventEmitter from 'eventemitter3';

function gunComponent(container: Container, p: Props) {
    getRoomById('ship', p.shipId).then((shipRoom) => {
        const viewModelChanges = new EventEmitter();
        const panel = new PropertyPanel(viewModelChanges);
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });

        panel.addProperty('cooldown', () => shipRoom.state.autoCannon?.cooldown || 0, [0, 1]);
        panel.addProperty(
            'isFiring',
            () => Number(shipRoom.state.autoCannon?.isFiring || 0),
            [0, 1],
            (value) => {
                shipRoom.send('autoCannon', { isFiring: Boolean(value) });
            },
            {
                gamepadIndex: 0,
                buttonIndex: 4,
            }
        );
        panel.addProperty('angle', () => Number(shipRoom.state.autoCannon?.angle || 0), [0, 360]);

        for (const eventName of viewModelChanges.eventNames()) {
            shipRoom.state.events.on(eventName, () => viewModelChanges.emit(eventName));
        }
        shipRoom.state.events.on('velocity', () => {
            viewModelChanges.emit('speed');
            viewModelChanges.emit('speed direction');
        });

        shipRoom.state.events.on('autoCannon', () => {
            viewModelChanges.emit('cooldown');
            viewModelChanges.emit('isFiring');
            viewModelChanges.emit('angle');
        });
    });
}

export type Props = { shipId: string };
export const gunWidget: DashboardWidget<Props> = {
    name: 'gun',
    type: 'component',
    component: gunComponent,
    defaultProps: {},
};
