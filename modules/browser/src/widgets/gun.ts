import { Container } from 'golden-layout';
import { getRoomById, getGlobalRoom } from '../client';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';
import EventEmitter from 'eventemitter3';
import { once } from '../async-utils';
import { Loop } from '../loop';
import { XY } from '@starwards/model';

function gunComponent(container: Container, p: Props) {
    (async () => {
        const [spaceRoom, shipRoom] = await Promise.all([getGlobalRoom('space'), getRoomById('ship', p.shipId)]);
        await once(shipRoom.state.events, 'autoCannon');
        let manualShellSecondsToLive = shipRoom.state.autoCannon.shellSecondsToLive;
        const loop = new Loop(() => {
            const targetObj = shipRoom.state.targetId && spaceRoom.state.get(shipRoom.state.targetId);
            const spaceShip = shipRoom.state.id && spaceRoom.state.get(shipRoom.state.id);
            if (targetObj && spaceShip) {
                const distance = XY.lengthOf(XY.difference(targetObj.position, spaceShip.position));
                const time = distance / shipRoom.state.autoCannon.constants.bulletSpeed;
                shipRoom.send('setShellSecondsToLive', { value: time });
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
                shipRoom.state.autoCannon.constants.minShellSecondsToLive,
                shipRoom.state.autoCannon.constants.maxShellSecondsToLive,
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
        panel.addProperty('shellSecondsToLive', () => shipRoom.state.autoCannon.shellSecondsToLive, [
            shipRoom.state.autoCannon.constants.minShellSecondsToLive,
            shipRoom.state.autoCannon.constants.maxShellSecondsToLive,
        ]);
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
