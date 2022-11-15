import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../panel';
import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';
import { readNumberProp } from '../property-wrappers';

export function gunWidget(shipDriver: ShipDriver): DashboardWidget {
    class GunComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const panel = new PropertyPanel(container);
            container.on('destroy', () => {
                panel.destroy();
            });
            const chainGunPanel = panel.addFolder('chainGun');

            chainGunPanel.addProperty('max Ammo', readNumberProp(shipDriver, `/magazine/count_CannonShell`));
            chainGunPanel.addProperty('ammo', readNumberProp(shipDriver, `/magazine/count_CannonShell`));
            chainGunPanel.addProperty('chainGunCooldown', readNumberProp(shipDriver, `/chainGun/cooldown`));
            chainGunPanel.addText('chainGunFire', { getValue: () => String(shipDriver.state.chainGun?.isFiring) });
            panel.addText('target', { getValue: () => String(shipDriver.state.weaponsTarget.targetId) });

            panel.addProperty('shellSecondsToLive', readNumberProp(shipDriver, `/chainGun/shellSecondsToLive`));
        }
    }
    return {
        name: 'gun',
        type: 'component',
        component: GunComponent,
        defaultProps: {},
    };
}
