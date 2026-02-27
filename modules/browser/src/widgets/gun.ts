import { Destructors, ShipDriver } from '@starwards/core';
import { addInputBlade, addSliderBlade, addTextBlade, createPane } from '../panel/blades';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { PropertyPanel } from '../panel';
import { WidgetContainer } from '../container';

export function drawGunStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const panelCleanup = new Destructors();
    const pane = createPane({ title: 'Chain Gun', container: container.getElement().get(0) });
    panelCleanup.add(() => {
        pane.dispose();
    });
    container.on('destroy', panelCleanup.destroy);
    addTextBlade(pane, readProp(shipDriver, '/chainGun/projectile'), { label: 'projectile' }, panelCleanup.add);
    addTextBlade(
        pane,
        readProp(shipDriver, '/chainGun/loadedProjectile'),
        { label: 'loaded projectile' },
        panelCleanup.add,
    );
    addSliderBlade(
        pane,
        readNumberProp(shipDriver, '/chainGun/loading'),
        { label: 'loading', disabled: true },
        panelCleanup.add,
    );
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

            chainGunPanel.addProperty('max Ammo', readNumberProp(shipDriver, `/magazine/count_CannonShell`));
            chainGunPanel.addProperty('ammo', readNumberProp(shipDriver, `/magazine/count_CannonShell`));
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
