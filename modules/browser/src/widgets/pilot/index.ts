import '@maulingmonkey/gamepad';
import { getTarget, TargetedStatus, XY } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getGlobalRoom, getShipRoom } from '../../client';
import { Loop } from '../../loop';
import { PropertyPanel } from '../../property-panel';
import { DashboardWidget } from '../dashboard';
import { ManeuveringComponent } from './maneuvering';
import { RotationComponent } from './rotation';

function pilotComponent(container: Container, p: Props) {
    void (async () => {
        const [spaceRoom, shipRoom] = await Promise.all([getGlobalRoom('space'), getShipRoom(p.shipId)]);
        const viewModelChanges = new EventEmitter();
        const panel = new PropertyPanel(viewModelChanges);
        const maneuveringState = new ManeuveringComponent(shipRoom, viewModelChanges);
        const headingComp = new RotationComponent(shipRoom, viewModelChanges);
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });

        headingComp.addToPanel(panel);
        maneuveringState.addToPanel(panel);

        const loop = new Loop((deltaSeconds: number) => {
            const target = getTarget(shipRoom.state, spaceRoom.state);
            maneuveringState.update(deltaSeconds, target);
            headingComp.update(deltaSeconds, target);
        }, 1000 / 10);
        loop.start();
        addEventListener(
            'mmk-gamepad-button-down',
            (e: mmk.gamepad.GamepadButtonEvent & CustomEvent<undefined>): void => {
                if (e.buttonIndex === 11 && e.gamepadIndex === 0) {
                    maneuveringState.toggleState();
                } else if (e.buttonIndex === 10 && e.gamepadIndex === 0) {
                    headingComp.toggleState();
                }
            }
        );

        panel.addProperty('energy', () => shipRoom.state.energy, [0, 1000]);
        panel.addProperty('potentialSpeed', () => shipRoom.state.potentialSpeed, [0, 1000]);
        panel.addProperty(
            'combatManeuvers',
            () => shipRoom.state.combatManeuvers,
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
