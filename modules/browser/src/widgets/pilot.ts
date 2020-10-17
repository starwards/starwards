import '@maulingmonkey/gamepad';
import {
    capToRange,
    getTarget,
    matchTargetSpeed,
    rotateToTarget,
    rotationFromTargetTurnSpeed,
    TargetedStatus,
    XY,
} from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getGlobalRoom, getShipRoom } from '../client';
import { Loop } from '../loop';
import { PropertyPanel } from '../property-panel';
import { StatesToggle } from '../states-toggle';
import { DashboardWidget } from './dashboard';

function pilotComponent(container: Container, p: Props) {
    void (async () => {
        const [spaceRoom, shipRoom] = await Promise.all([getGlobalRoom('space'), getShipRoom(p.shipId)]);
        const viewModelChanges = new EventEmitter();
        const maneuveringState = new StatesToggle('ENGINE', 'TARGET');
        const matchHeading = new StatesToggle('SPEED', 'TARGET');
        const panel = new PropertyPanel(viewModelChanges);
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });

        panel.addText('matchSpeed', () => maneuveringState.toString());
        panel.addText('matchHeading', () => matchHeading.toString());

        let targetTurnSpeed = 0;
        const loop = new Loop((deltaSeconds: number) => {
            const target = getTarget(shipRoom.state, spaceRoom.state);
            maneuveringState.setLegalState('TARGET', !!target);
            matchHeading.setLegalState('TARGET', !!target);
            if (maneuveringState.isState('TARGET')) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const command = matchTargetSpeed(deltaSeconds, shipRoom.state, target!.velocity);
                shipRoom.send('setStrafe', { value: capToRange(-1, 1, command.strafe) });
                shipRoom.send('setBoost', { value: capToRange(-1, 1, command.boost) });
            }
            if (matchHeading.isState('TARGET')) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const command = rotateToTarget(deltaSeconds, shipRoom.state, target!.position);
                if (shipRoom.state.rotation !== command) {
                    shipRoom.send('setRotation', { value: command });
                }
            } else {
                const command = rotationFromTargetTurnSpeed(deltaSeconds, shipRoom.state, targetTurnSpeed);
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
                    maneuveringState.toggleState();
                    shipRoom.send('setStrafe', { value: 0 });
                    shipRoom.send('setBoost', { value: 0 });
                    viewModelChanges.emit('matchSpeed');
                } else if (e.buttonIndex === 10 && e.gamepadIndex === 0) {
                    matchHeading.toggleState();
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
            'antiDrift',
            () => shipRoom.state.antiDrift,
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
            },
            {
                gamepadIndex: 0,
                buttonIndex: 5,
            }
        );
        panel.addProperty(
            'strafe',
            () => shipRoom.state.strafe,
            [-1, 1],
            (value) => {
                if (maneuveringState.isState('ENGINE')) {
                    shipRoom.send('setStrafe', { value: value });
                }
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
            [-1, 1],
            (value) => {
                if (maneuveringState.isState('ENGINE')) {
                    shipRoom.send('setBoost', { value: value });
                }
            },
            {
                gamepadIndex: 0,
                axisIndex: 3,
                deadzone: [-0.01, 0.01],
                inverted: true,
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
