import '@maulingmonkey/gamepad';
import {
    TargetedStatus,
    XY,
    capToRange,
    getTarget,
    matchTargetSpeed,
    calcRotationForTargetDirection,
    rotationFromTargetTurnSpeed,
} from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getGlobalRoom, getShipRoom } from '../client';
import { Loop } from '../loop';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';

export enum OnOffStatus {
    OFF,
    ON,
}

function pilotComponent(container: Container, p: Props) {
    (async () => {
        const [spaceRoom, shipRoom] = await Promise.all([getGlobalRoom('space'), getShipRoom(p.shipId)]);
        const viewModelChanges = new EventEmitter();
        let matchSpeed = OnOffStatus.OFF;
        let matchHeading = OnOffStatus.OFF;
        const panel = new PropertyPanel(viewModelChanges);
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });

        panel.addText('matchSpeed', () => OnOffStatus[matchSpeed]);
        panel.addText('matchHeading', () => OnOffStatus[matchHeading]);

        let targetTurnSpeed = 0;

        const loop = new Loop((delta: number) => {
            const target = getTarget(shipRoom.state, spaceRoom.state);
            if (matchSpeed === OnOffStatus.ON) {
                const command = target && matchTargetSpeed(delta, shipRoom.state, target);
                if (command) {
                    shipRoom.send('setStrafe', { value: capToRange(-5, 5, command.strafe) });
                    shipRoom.send('setBoost', { value: capToRange(-5, 5, command.boost) });
                } else {
                    matchSpeed = OnOffStatus.OFF;
                }
            }
            if (matchHeading === OnOffStatus.ON) {
                const command = target && calcRotationForTargetDirection(shipRoom.state, target.position);
                if (typeof command === 'number') {
                    shipRoom.send('setRotation', { value: command });
                } else {
                    matchHeading = OnOffStatus.OFF;
                }
            } else {
                const command = rotationFromTargetTurnSpeed(shipRoom.state, targetTurnSpeed);
                if (shipRoom.state.rotation !== command) {
                    shipRoom.send('setRotation', { value: command });
                }
            }
        }, 1000 / 10);
        loop.start();
        addEventListener(
            'mmk-gamepad-button-down',
            (e: mmk.gamepad.GamepadButtonEvent & CustomEvent<undefined>): void => {
                if (e.buttonIndex === 11 && e.gamepadIndex === 0) {
                    matchSpeed = (matchSpeed + 1) % 2;
                    shipRoom.send('setStrafe', { value: 0 });
                    shipRoom.send('setBoost', { value: 0 });
                    viewModelChanges.emit('matchSpeed');
                } else if (e.buttonIndex === 10 && e.gamepadIndex === 0) {
                    matchHeading = (matchHeading + 1) % 2;
                    shipRoom.send('setRotation', { value: 0 });
                    targetTurnSpeed = 0;
                    viewModelChanges.emit('targetTurnSpeed');
                    viewModelChanges.emit('matchHeading');
                }
            }
        );

        panel.addProperty('energy', () => shipRoom.state.energy, [0, 1000]);
        panel.addProperty(
            'targetTurnSpeed',
            () => targetTurnSpeed,
            [-90, 90],
            (value) => {
                targetTurnSpeed = value;
                viewModelChanges.emit('targetTurnSpeed');
            },
            {
                gamepadIndex: 0,
                axisIndex: 0,
                deadzone: [-0.01, 0.01],
            }
        );
        panel.addProperty('rotation', () => shipRoom.state.rotation, [-1, 1]);
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
                if (matchSpeed === OnOffStatus.OFF) shipRoom.send('setStrafe', { value });
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
                if (matchSpeed === OnOffStatus.OFF) shipRoom.send('setBoost', { value });
            },
            {
                gamepadIndex: 0,
                axisIndex: 3,
                deadzone: [-0.01, 0.01],
                inverted: true,
            }
        );
        panel.addProperty('turnSpeed', () => shipRoom.state.turnSpeed, [-180, 180]);
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
