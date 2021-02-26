import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../property-panel';
import { getShipRoom } from '../client';
import { shipProperties } from '../ship-properties';

class GunComponent {
    constructor(container: Container, p: Props) {
        void (async () => {
            const shipRoom = await getShipRoom(p.shipId);
            const panel = new PropertyPanel();
            panel.init(container);
            container.on('destroy', () => {
                panel.destroy();
            });
            const properties = shipProperties(shipRoom);
            const chainGunPanel = panel.addFolder('chainGun');

            chainGunPanel.addProperty('chainGunCooldown', properties.chainGunCooldown);
            chainGunPanel.addText('chainGunFire', properties.chainGunIsFiring);
            panel.addText('target', properties.target);

            panel.addProperty('shellSecondsToLive', properties.shellSecondsToLive);
            chainGunPanel.addProperty('shellSecondsToLive', properties.chainGunShellSecondsToLive);
        })();
    }
}

export type Props = { shipId: string };
export const gunWidget: DashboardWidget<Props> = {
    name: 'gun',
    type: 'component',
    component: GunComponent,
    defaultProps: {},
};
