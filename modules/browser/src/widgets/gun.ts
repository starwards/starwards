import { PropertyPanel, createWidgetPane } from '../panel';
import { addBarBlade, addInputBlade, addTextBlade } from '../panel/blades';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';

export function drawGunStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Chain Gun');
    const mounts = shipDriver.state.chainGuns;
    for (const index of mounts.keys()) {
        const gunPane = mounts.length > 1 ? pane.addFolder({ title: `Chain Gun ${index}`, expanded: true }) : pane;
        if (mounts.length > 1) {
            panelCleanup.add(() => gunPane.dispose());
        }
        addTextBlade(
            gunPane,
            readProp(shipDriver, `/chainGuns/${index}/projectile`),
            { label: 'projectile' },
            panelCleanup.add,
        );
        addTextBlade(
            gunPane,
            readProp(shipDriver, `/chainGuns/${index}/loadedProjectile`),
            { label: 'loaded projectile' },
            panelCleanup.add,
        );
        addBarBlade(
            gunPane,
            readNumberProp(shipDriver, `/chainGuns/${index}/loading`),
            { label: 'loading' },
            panelCleanup.add,
        );
        addInputBlade(
            gunPane,
            readProp(shipDriver, `/chainGuns/${index}/loadAmmo`),
            { label: 'auto load' },
            panelCleanup.add,
        );
    }
}

export function gunWidget(shipDriver: ShipDriver): DashboardWidget {
    class GunComponent {
        constructor(container: WidgetContainer, _: unknown) {
            const panel = new PropertyPanel(container);
            container.on('destroy', () => {
                panel.destroy();
            });
            panel.addText('target', { getValue: () => String(shipDriver.state.weaponsTarget.targetId) });

            for (const [index] of shipDriver.state.chainGuns.entries()) {
                const chainGunPanel = panel.addFolder(`chainGun${index}`);

                chainGunPanel.addProperty('max Ammo', readNumberProp(shipDriver, `/magazine/count_HiExpShell`));
                chainGunPanel.addProperty('ammo', readNumberProp(shipDriver, `/magazine/count_HiExpShell`));
                chainGunPanel.addProperty('loading', readNumberProp(shipDriver, `/chainGuns/${index}/loading`));
                chainGunPanel.addText('chainGunFire', {
                    getValue: () => String(shipDriver.state.chainGuns[index]?.isFiring),
                });
                chainGunPanel.addText('loadAmmo', {
                    getValue: () => String(shipDriver.state.chainGuns[index]?.loadAmmo),
                });
                chainGunPanel.addProperty(
                    'shellSecondsToLive',
                    readNumberProp(shipDriver, `/chainGuns/${index}/shellSecondsToLive`),
                );
            }
        }
    }
    return {
        name: 'gun',
        type: 'component',
        component: GunComponent,
        defaultProps: {},
    };
}
