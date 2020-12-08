import '@maulingmonkey/gamepad';
import { SmartPilotMode, TargetedStatus } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getShipRoom } from '../client';
import { InputManager } from '../input-manager';
import { PropertyPanel } from '../property-panel';
import { shipProperties } from '../ship-properties';
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
        const properties = shipProperties(shipRoom);

        panel.addText('smartPilot.rotationMode', () => SmartPilotMode[shipRoom.state.smartPilot.rotationMode]);
        panel.addProperty(properties['smartPilot.rotation']);
        input.addAxisAction(properties['smartPilot.rotation'], {
            gamepadIndex: 0,
            axisIndex: 0,
            deadzone: [-0.01, 0.01],
        });
        panel.addProperty(properties.rotation);
        panel.addText('smartPilot.maneuveringMode', () => SmartPilotMode[shipRoom.state.smartPilot.maneuveringMode]);
        shipRoom.state.events.on('smartPilot.maneuvering', () => {
            viewModelChanges.emit('smartPilot.boost');
            viewModelChanges.emit('smartPilot.strafe');
        });
        panel.addProperty(properties['smartPilot.strafe']);
        input.addAxisAction(properties['smartPilot.strafe'], {
            gamepadIndex: 0,
            axisIndex: 2,
            deadzone: [-0.01, 0.01],
        });
        panel.addProperty(properties['smartPilot.boost']);
        input.addAxisAction(properties['smartPilot.boost'], {
            gamepadIndex: 0,
            axisIndex: 3,
            deadzone: [-0.01, 0.01],
            inverted: true,
        });
        panel.addProperty(properties.strafe);
        panel.addProperty(properties.boost);

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

        panel.addProperty(properties.energy);
        panel.addProperty(properties.reserveSpeed);
        panel.addProperty(properties.useReserveSpeed);
        input.addButtonAction(properties.useReserveSpeed, {
            gamepadIndex: 0,
            buttonIndex: 6,
        });
        panel.addProperty(properties.antiDrift);
        input.addButtonAction(properties.antiDrift, {
            gamepadIndex: 0,
            buttonIndex: 7,
        });
        panel.addProperty(properties.breaks);
        input.addButtonAction(properties.breaks, {
            gamepadIndex: 0,
            buttonIndex: 5,
        });
        panel.addProperty(properties.turnSpeed);
        panel.addProperty(properties.angle);
        panel.addProperty(properties['speed direction']);
        panel.addProperty(properties.speed);
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
