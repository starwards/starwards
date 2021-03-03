import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../property-panel';
import { ShipDriver } from '../driver';

class GunComponent {
    constructor(container: Container, { shipDriver }: Props) {
        const panel = new PropertyPanel();
        panel.init(container);
        container.on('destroy', () => {
            panel.destroy();
        });
        const chainGunPanel = panel.addFolder('chainGun');

        chainGunPanel.addProperty('chainGunCooldown', shipDriver.chainGunCooldown);
        chainGunPanel.addText('chainGunFire', shipDriver.chainGunIsFiring);
        panel.addText('target', shipDriver.target);

        panel.addProperty('shellSecondsToLive', shipDriver.shellSecondsToLive);
        chainGunPanel.addProperty('shellSecondsToLive', shipDriver.chainGunShellSecondsToLive);
    }
}

export type Props = { shipDriver: ShipDriver };
export const gunWidget: DashboardWidget<Props> = {
    name: 'gun',
    type: 'component',
    component: GunComponent,
    defaultProps: {},
};
