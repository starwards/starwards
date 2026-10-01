import {
    PropertyPanel,
    addAnnunciatorBlade,
    addSegmentedBarBlade,
    addSubheader,
    createWidgetPane,
    setAnnunciatorColumns,
} from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';
import { addMountAmmoRows } from './mount-readout';

export function drawGunStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Chain Gun');
    const mounts = shipDriver.state.chainGuns;
    for (const index of mounts.keys()) {
        const gunPane = mounts.length > 1 ? addSubheader(pane, `Chain Gun ${index}`, panelCleanup.add) : pane;
        addMountAmmoRows(gunPane, shipDriver, `/chainGuns/${index}`, panelCleanup);
        addSegmentedBarBlade(gunPane, readNumberProp(shipDriver, `/chainGuns/${index}/loading`), panelCleanup.add);
        addAnnunciatorBlade(
            gunPane,
            readProp(shipDriver, `/chainGuns/${index}/loadAmmo`),
            { label: 'Auto load' },
            panelCleanup.add,
        );
        addAnnunciatorBlade(
            gunPane,
            readProp(shipDriver, `/chainGuns/${index}/isFiring`),
            { label: 'Firing' },
            panelCleanup.add,
        );
        setAnnunciatorColumns(gunPane, 2);
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
