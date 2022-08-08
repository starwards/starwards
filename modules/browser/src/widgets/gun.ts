import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../panel';
import { ShipDriver } from '@starwards/core';

export function gunWidget(shipDriver: ShipDriver): DashboardWidget {
    class GunComponent {
        constructor(container: Container, _: unknown) {
            const panel = new PropertyPanel(container);
            container.on('destroy', () => {
                panel.destroy();
            });
            const chainGunPanel = panel.addFolder('chainGun');

            chainGunPanel.addProperty('chainGunCooldown', shipDriver.chainGunCooldown);
            chainGunPanel.addText('chainGunFire', { getValue: () => String(shipDriver.chainGunIsFiring.getValue()) });
            panel.addText('target', { getValue: () => String(shipDriver.target.getValue()) });

            panel.addProperty('shellSecondsToLive', shipDriver.shellSecondsToLive);
        }
    }
    return {
        name: 'gun',
        type: 'component',
        component: GunComponent,
        defaultProps: {},
    };
}
