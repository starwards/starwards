import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../property-panel';
import { ShipDriver } from '../driver';

export function gunWidget(shipDriver: ShipDriver): DashboardWidget {
    class GunComponent {
        constructor(container: Container, _: unknown) {
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
    return {
        name: 'gun',
        type: 'component',
        component: GunComponent,
        defaultProps: {},
    };
}
