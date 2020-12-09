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
        const panel = new PropertyPanel();
        const input = new InputManager();
        panel.init(container);
        input.init();
        container.on('destroy', () => {
            panel.destroy();
            input.destroy();
        });
        const properties = shipProperties(shipRoom);
        const chainGunPanel = panel.addFolder('chainGun');

        chainGunPanel.addProperty('chainGun.cooldown', properties['chainGun.cooldown']);
        chainGunPanel.addText('chainGun.isFiring', properties['chainGun.isFiring']);
        panel.addText('target', properties.target);
        // TODO fix and move to shipManager
        const manualSSTL: NumericProperty = {
            getValue: () => manualShellSecondsToLive,
            range: [shipRoom.state.chainGun.minShellSecondsToLive, shipRoom.state.chainGun.maxShellSecondsToLive],
            onChange: (value: number) => {
                manualShellSecondsToLive = value;
            },
        };
        panel.addProperty('manual shellSecondsToLive', manualSSTL);
        input.addAxisAction(manualSSTL, {
            gamepadIndex: 0,
            axisIndex: 1,
            deadzone: [-0.01, 0.01],
            inverted: true,
        });
        chainGunPanel.addProperty('shellSecondsToLive', properties['chainGun.shellSecondsToLive']);
    })();
}

export type Props = { shipId: string };
export const gunWidget: DashboardWidget<Props> = {
    name: 'gun',
    type: 'component',
    component: gunComponent,
    defaultProps: {},
};
