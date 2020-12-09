import { calcShellSecondsToLive, getTarget } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getGlobalRoom, getShipRoom } from '../client';
import { InputManager } from '../input-manager';
import { Loop } from '../loop';
import { PropertyPanel } from '../property-panel';
import { shipProperties, NumericProperty } from '../ship-properties';
import { DashboardWidget } from './dashboard';

function gunComponent(container: Container, p: Props) {
    void (async () => {
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
        const input = new InputManager();
        panel.init(container);
        input.init();
        container.on('destroy', () => {
            panel.destroy();
            input.destroy();
        });
        const properties = shipProperties(shipRoom);
        const chainGunPanel = panel.addFolder('chainGun');

        chainGunPanel.addProperty(properties['chainGun.cooldown']);
        chainGunPanel.addText(properties['chainGun.isFiring']);
        panel.addText(properties.target);
        // TODO fix and move to shipManager
        const manualSSTL: NumericProperty = {
            name: 'manual shellSecondsToLive',
            getValue: () => manualShellSecondsToLive,
            range: [shipRoom.state.chainGun.minShellSecondsToLive, shipRoom.state.chainGun.maxShellSecondsToLive],
            onChange: (value: number) => {
                manualShellSecondsToLive = value;
                viewModelChanges.emit('manual shellSecondsToLive');
            },
        };
        panel.addProperty(manualSSTL);
        input.addAxisAction(manualSSTL, {
            gamepadIndex: 0,
            axisIndex: 1,
            deadzone: [-0.01, 0.01],
            inverted: true,
        });
        chainGunPanel.addProperty(properties['chainGun.shellSecondsToLive']);
        for (const eventName of viewModelChanges.eventNames()) {
            shipRoom.state.events.on(eventName, () => viewModelChanges.emit(eventName));
        }
        shipRoom.state.events.on('velocity', () => {
            viewModelChanges.emit('speed');
            viewModelChanges.emit('speed direction');
        });

        // shipRoom.state.events.on('chainGun', () => {
        //     viewModelChanges.emit('cooldown');
        //     viewModelChanges.emit('isFiring');
        //     viewModelChanges.emit('angle');
        //     viewModelChanges.emit('shellSecondsToLive');
        // });
    })();
}

export type Props = { shipId: string };
export const gunWidget: DashboardWidget<Props> = {
    name: 'gun',
    type: 'component',
    component: gunComponent,
    defaultProps: {},
};
