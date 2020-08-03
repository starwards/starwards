import { TargetedStatus, XY } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getShipRoom } from '../client';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';

function pilotComponent(container: Container, p: Props) {
    (async () => {
        const shipRoom = await getShipRoom(p.shipId);
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
                shipRoom.send('setTargetTurnSpeed', { value });
            },
            {
                gamepadIndex: 0,
                axisIndex: 0,
                deadzone: [-0.01, 0.01],
            }
        );
        panel.addProperty(
            'impulse',
            () => shipRoom.state.impulse,
            [0, 5],
            (value) => {
                shipRoom.send('setImpulse', { value });
            },
            {
                gamepadIndex: 0,
                buttonIndex: 6,
            }
        );
        panel.addProperty(
            'antiDrift',
            () => shipRoom.state.antiDrift,
            [0, 1],
            (value) => {
                shipRoom.send('setAntiDrift', { value });
            },
            {
                gamepadIndex: 0,
                buttonIndex: 7,
            }
        );
        panel.addProperty(
            'breaks',
            () => shipRoom.state.breaks,
            [0, 1],
            (value) => {
                shipRoom.send('setBreaks', { value });
            },
            {
                gamepadIndex: 0,
                buttonIndex: 5,
            }
        );
        panel.addProperty(
            'strafe',
            () => shipRoom.state.strafe,
            [-5, 5],
            (value) => {
                shipRoom.send('setStrafe', { value });
            },
            {
                gamepadIndex: 0,
                axisIndex: 2,
                deadzone: [-0.01, 0.01],
            }
        );
        panel.addProperty(
            'boost',
            () => shipRoom.state.boost,
            [-5, 5],
            (value) => {
                shipRoom.send('setBoost', { value });
            },
            {
                gamepadIndex: 0,
                axisIndex: 3,
                deadzone: [-0.01, 0.01],
                inverted: true,
            }
        );
        panel.addProperty('turnSpeed', () => shipRoom.state.turnSpeed, [-120, 120]);
        panel.addProperty('angle', () => shipRoom.state.angle, [0, 360]);
        panel.addProperty('speed direction', () => XY.angleOf(shipRoom.state.velocity), [0, 360]);
        panel.addProperty('speed', () => XY.lengthOf(shipRoom.state.velocity), [0, 1000]);
        panel.addText('targeted', () => TargetedStatus[shipRoom.state.targeted]);

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
