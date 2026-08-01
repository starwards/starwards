import { PropertyPanel, createWidgetPane } from '../panel';
import { addBarBlade, addInputBlade, addTextBlade } from '../panel/blades';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';

export function drawGunStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Chain Gun');
    addTextBlade(pane, readProp(shipDriver, '/chainGun/projectile'), { label: 'projectile' }, panelCleanup.add);
    addTextBlade(
        pane,
        readProp(shipDriver, '/chainGun/loadedProjectile'),
        { label: 'loaded projectile' },
        panelCleanup.add,
    );
    addBarBlade(pane, readNumberProp(shipDriver, '/chainGun/loading'), { label: 'loading' }, panelCleanup.add);
    addInputBlade(pane, readProp(shipDriver, '/chainGun/loadAmmo'), { label: 'auto load' }, panelCleanup.add);
}

export function gunWidget(shipDriver: ShipDriver): DashboardWidget {
    class GunComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const panel = new PropertyPanel(container);
            container.on('destroy', () => {
                panel.destroy();
            });
            const chainGunPanel = panel.addFolder('chainGun');

            chainGunPanel.addProperty('max Ammo', readNumberProp(shipDriver, `/magazine/count_HiExpShell`));
            chainGunPanel.addProperty('ammo', readNumberProp(shipDriver, `/magazine/count_HiExpShell`));
            chainGunPanel.addProperty('loading', readNumberProp(shipDriver, `/chainGun/loading`));
            chainGunPanel.addText('chainGunFire', { getValue: () => String(shipDriver.state.chainGun?.isFiring) });
            chainGunPanel.addText('loadAmmo', { getValue: () => String(shipDriver.state.chainGun?.loadAmmo) });
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
