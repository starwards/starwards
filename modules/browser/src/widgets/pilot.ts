import '@maulingmonkey/gamepad';
import { SmartPilotMode, TargetedStatus, XY } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getShipRoom } from '../client';
import { InputManager } from '../input-manager';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';

function pilotComponent(container: Container, p: Props) {
    void (async () => {
        const shipRoom = await getShipRoom(p.shipId);
        const viewModelChanges = new EventEmitter();
        const panel = new PropertyPanel(viewModelChanges);
        const input = new InputManager();
        panel.init(container);
        input.init();
        container.on('destroy', () => {
            panel.destroy();
            input.destroy();
        });

        panel.addText('smartPilot.rotationMode', () => SmartPilotMode[shipRoom.state.smartPilot.rotationMode]);
        panel.addProperty(
            'smartPilot.rotation',
            () => shipRoom.state.smartPilot.rotation,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotRotation', { value })
        );
        input.addAxisAction([-1, 1], (value) => shipRoom.send('setSmartPilotRotation', { value }), {
            gamepadIndex: 0,
            axisIndex: 0,
            deadzone: [-0.01, 0.01],
        });
        panel.addProperty('rotation', () => shipRoom.state.rotation, [-1, 1]);
        panel.addText('smartPilot.maneuveringMode', () => SmartPilotMode[shipRoom.state.smartPilot.maneuveringMode]);
        shipRoom.state.events.on('smartPilot.maneuvering', () => {
            viewModelChanges.emit('smartPilot.boost');
            viewModelChanges.emit('smartPilot.strafe');
        });
        panel.addProperty(
            'smartPilot.strafe',
            () => shipRoom.state.smartPilot.maneuvering.y,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotStrafe', { value: value })
        );
        input.addAxisAction([-1, 1], (value) => shipRoom.send('setSmartPilotStrafe', { value: value }), {
            gamepadIndex: 0,
            axisIndex: 2,
            deadzone: [-0.01, 0.01],
        });
        panel.addProperty(
            'smartPilot.boost',
            () => shipRoom.state.smartPilot.maneuvering.x,
            [-1, 1],
            (value) => shipRoom.send('setSmartPilotBoost', { value: value })
        );
        input.addAxisAction([-1, 1], (value) => shipRoom.send('setSmartPilotBoost', { value: value }), {
            gamepadIndex: 0,
            axisIndex: 3,
            deadzone: [-0.01, 0.01],
            inverted: true,
        });
        panel.addProperty('strafe', () => shipRoom.state.strafe, [-1, 1]);
        panel.addProperty('boost', () => shipRoom.state.boost, [-1, 1]);

        addEventListener(
            'mmk-gamepad-button-down',
            (e: mmk.gamepad.GamepadButtonEvent & CustomEvent<undefined>): void => {
                if (e.buttonIndex === 11 && e.gamepadIndex === 0) {
                    shipRoom.send('toggleSmartPilotManeuveringMode', {});
                } else if (e.buttonIndex === 10 && e.gamepadIndex === 0) {
                    shipRoom.send('toggleSmartPilotRotationMode', {});
                }
            }
        );

        panel.addProperty('energy', () => shipRoom.state.energy, [0, 1000]);
        panel.addProperty('reserveSpeed', () => shipRoom.state.reserveSpeed, [0, 1000]);
        panel.addProperty(
            'useReserveSpeed',
            () => shipRoom.state.useReserveSpeed,
            [0, 1],
            (value) => {
                shipRoom.send('setCombatManeuvers', { value: value });
            }
        );
        input.addButtonAction(
            [0, 1],
            (value) => {
                shipRoom.send('setCombatManeuvers', { value: value });
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
                shipRoom.send('setAntiDrift', { value: value });
            }
        );
        input.addButtonAction(
            [0, 1],
            (value) => {
                shipRoom.send('setAntiDrift', { value: value });
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
                shipRoom.send('setBreaks', { value: value });
            }
        );
        input.addButtonAction(
            [0, 1],
            (value) => {
                shipRoom.send('setBreaks', { value: value });
            },
            {
                gamepadIndex: 0,
                buttonIndex: 5,
            }
        );
        panel.addProperty('turnSpeed', () => shipRoom.state.turnSpeed, [-90, 90]);
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
