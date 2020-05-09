import { Container } from 'golden-layout';
import { getRoomById } from '../client';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';
import { XY } from '@starwards/model';
import EventEmitter from 'eventemitter3';

function pilotComponent(container: Container, p: Props) {
    getRoomById('ship', p.shipId).then((shipRoom) => {
        const viewModelChanges = new EventEmitter();
        const panel = new PropertyPanel(viewModelChanges);
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });
        panel.addProperty('energy', () => shipRoom.state.energy, [0, 1000]);
        panel.addProperty(
            'targetTurnSpeed',
            () => shipRoom.state.targetTurnSpeed,
            [-90, 90],
            (value) => {
                shipRoom.send('SetTargetTurnSpeed', { value });
            },
            {
                gamepadIndex: 0,
                axisIndex: 5,
                deadzone: [-0.1, 0.05],
            }
        );
        panel.addProperty(
            'impulse',
            () => shipRoom.state.impulse,
            [0, 5],
            (value) => {
                shipRoom.send('SetImpulse', { value });
            },
            {
                gamepadIndex: 0,
                buttonIndex: 0,
            }
        );
        panel.addProperty(
            'stabilizer',
            () => shipRoom.state.stabilizer,
            [0, 1],
            (value) => {
                shipRoom.send('SetStabilizer', { value });
            },
            {
                gamepadIndex: 0,
                axisIndex: 2,
                deadzone: [0, 0],
                inverted: true,
            }
        );
        panel.addProperty('turnSpeed', () => shipRoom.state.turnSpeed, [-120, 120]);
        panel.addProperty('angle', () => shipRoom.state.angle, [0, 360]);
        panel.addProperty('speed direction', () => XY.angleOf(shipRoom.state.velocity), [0, 360]);
        panel.addProperty('speed', () => XY.lengthOf(shipRoom.state.velocity), [0, 1000]);

        for (const eventName of viewModelChanges.eventNames()) {
            shipRoom.state.events.on(eventName, () => viewModelChanges.emit(eventName));
        }
        shipRoom.state.events.on('velocity', () => {
            viewModelChanges.emit('speed');
            viewModelChanges.emit('speed direction');
        });
    });
}

export type Props = { shipId: string };
export const pilotWidget: DashboardWidget<Props> = {
    name: 'pilot',
    type: 'component',
    component: pilotComponent,
    defaultProps: {},
};
