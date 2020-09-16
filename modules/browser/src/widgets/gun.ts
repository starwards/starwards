import { calcShellSecondsToLive, getTarget } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getGlobalRoom, getShipRoom } from '../client';
import { Loop } from '../loop';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';

function gunComponent(container: Container, p: Props) {
    (async () => {
        const [spaceRoom, shipRoom] = await Promise.all([getGlobalRoom('space'), getShipRoom(p.shipId)]);
        let manualShellSecondsToLive = shipRoom.state.chainGun.shellSecondsToLive;
        const loop = new Loop(() => {
            const target = getTarget(shipRoom.state, spaceRoom.state);
            if (target) {
                shipRoom.send('setShellSecondsToLive', {
                    value: calcShellSecondsToLive(shipRoom.state, target.position),
                });
            } else {
                shipRoom.send('setShellSecondsToLive', { value: manualShellSecondsToLive });
            }
        }, 1000 / 10);
        loop.start();
        const viewModelChanges = new EventEmitter();
        const panel = new PropertyPanel(viewModelChanges);
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });

        panel.addProperty('cooldown', () => shipRoom.state.chainGun?.cooldown || 0, [0, 1]);
        panel.addProperty(
            'isFiring',
            () => Number(shipRoom.state.chainGun?.isFiring || 0),
            [0, 1],
            (value) => {
                shipRoom.send('chainGun', { isFiring: Boolean(value) });
            },
            {
                gamepadIndex: 0,
                buttonIndex: 4,
            }
        );
        panel.addProperty('angle', () => Number(shipRoom.state.chainGun?.angle || 0), [0, 360]);
        panel.addProperty(
            'nextTarget',
            () => 0,
            [0, 1],
            (value) => {
                if (value) {
                    let currentFound = false;
                    for (const obj of spaceRoom.state.getAll('Spaceship')) {
                        if (obj.id === shipRoom.state.targetId) {
                            currentFound = true;
                        } else if (currentFound && obj.id !== p.shipId) {
                            shipRoom.send('setTarget', { id: obj.id });
                            return;
                        }
                    }
                    for (const obj of spaceRoom.state.getAll('Spaceship')) {
                        if (obj.id !== p.shipId) {
                            shipRoom.send('setTarget', { id: obj.id });
                            return;
                        }
                    }
                }
            },
            {
                gamepadIndex: 0,
                buttonIndex: 2,
            }
        );
        panel.addProperty(
            'manual shellSecondsToLive',
            () => manualShellSecondsToLive,
            [
                shipRoom.state.chainGun.constants.minShellSecondsToLive,
                shipRoom.state.chainGun.constants.maxShellSecondsToLive,
            ],
            (value) => {
                manualShellSecondsToLive = value;
                viewModelChanges.emit('manual shellSecondsToLive');
            },
            {
                gamepadIndex: 0,
                axisIndex: 1,
                deadzone: [-0.01, 0.01],
                inverted: true,
            }
        );
        panel.addProperty('shellSecondsToLive', () => shipRoom.state.chainGun.shellSecondsToLive, [
            shipRoom.state.chainGun.constants.minShellSecondsToLive,
            shipRoom.state.chainGun.constants.maxShellSecondsToLive,
        ]);
        for (const eventName of viewModelChanges.eventNames()) {
            shipRoom.state.events.on(eventName, () => viewModelChanges.emit(eventName));
        }
        shipRoom.state.events.on('velocity', () => {
            viewModelChanges.emit('speed');
            viewModelChanges.emit('speed direction');
        });

        shipRoom.state.events.on('chainGun', () => {
            viewModelChanges.emit('cooldown');
            viewModelChanges.emit('isFiring');
            viewModelChanges.emit('angle');
            viewModelChanges.emit('shellSecondsToLive');
        });
    })();
}

export type Props = { shipId: string };
export const gunWidget: DashboardWidget<Props> = {
    name: 'gun',
    type: 'component',
    component: gunComponent,
    defaultProps: {},
};
