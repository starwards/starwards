import { Destructors, ShipDriver, gunHeatBars } from '@starwards/core';
import {
    PropertyPanel,
    addAnnunciatorBlade,
    addInlineBarBlade,
    addSegmentedBarBlade,
    addSubheader,
    addTextBlade,
    createWidgetPane,
    setAnnunciatorColumns,
} from '../panel';
import { aggregate, readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { FolderApi } from 'tweakpane';
import { WidgetContainer } from '../container';
import { addMountAmmoRows } from './mount-readout';

/** `ownGun` adds the heat model rows: they belong to the gun's own crew, not to a screen showing someone else's gun. */
export function drawGunStatus(container: WidgetContainer, shipDriver: ShipDriver, ownGun = false) {
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
        if (ownGun) {
            addGunHeatRows(gunPane, shipDriver, `/chainGuns/${index}`, panelCleanup);
        }
    }
}

/** What the heat model is doing to this gun: heat against its bars, whether it is jammed or cooling, and barrel wear. */
function addGunHeatRows(folder: FolderApi, shipDriver: ShipDriver, pointer: `/${string}`, cleanup: Destructors) {
    const heat = readNumberProp(shipDriver, `${pointer}/heat`);
    const wear = readNumberProp(shipDriver, `${pointer}/barrelWear`);
    const jammed = readNumberProp(shipDriver, `${pointer}/jammedSeconds`);
    const cooling = readProp<boolean>(shipDriver, `${pointer}/cooling`);
    addInlineBarBlade(folder, heat, { label: 'Heat', format: (v: number) => String(Math.round(v)) }, cleanup.add);
    addTextBlade(
        folder,
        aggregate([wear], () => {
            const bars = gunHeatBars(wear.getValue() ?? 0);
            return `${Math.round(bars.spreadBar)} / ${Math.round(bars.jamBar)}`;
        }),
        { label: 'Spread / jam bar' },
        cleanup.add,
    );
    const state = addTextBlade(
        folder,
        aggregate([jammed, cooling], () =>
            (jammed.getValue() ?? 0) > 0 ? 'JAMMED' : cooling.getValue() ? 'COOLING' : 'READY',
        ),
        { label: 'Barrel' },
        cleanup.add,
    );
    state.element.classList.add('sw-mode');
    addInlineBarBlade(folder, wear, { label: 'Wear', format: (v: number) => `${Math.round(v * 100)}%` }, cleanup.add);
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
