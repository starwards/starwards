import { ShipDriver, ammoTypes, isRestockingAmmo } from '@starwards/core';
import { addInlineBarBlade, addSubheader, addTextBlade, applyThresholdTheme, createWidgetPane } from '../panel';
import { aggregate, readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
import { ammoFamilyName } from './ammo-names';
import { ammoGroups } from './ammo-groups';

export function ammoWidget(shipDriver: ShipDriver): DashboardWidget {
    class AmmoComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawAmmoStatus(container, shipDriver);
        }
    }
    return {
        name: 'ammo',
        type: 'component',
        component: AmmoComponent,
        defaultProps: {},
    };
}
export function drawAmmoStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Magazine');

    // isRestockingAmmo has no synced gameField of its own (AmmoManager's fractional accrual is
    // deliberately not player-facing) — it's a pure function of docking mode plus every ammo
    // type's count/max, so it's re-derived from those already-synced fields on each of their
    // changes rather than cached, the same rule the engineer repair-queue catalog applies to
    // `dynamicDuration`.
    const dockingModeProp = readProp<number>(shipDriver, '/docking/mode');
    const magazineCapacityProp = readProp<number>(shipDriver, '/magazine/capacity');
    const countProps = ammoTypes.map((at) => readProp<number>(shipDriver, `/magazine/count_${at}`));
    const maxProps = ammoTypes.map((at) => readProp<number>(shipDriver, `/magazine/design/max_${at}`));
    const restockingProp = aggregate([dockingModeProp, magazineCapacityProp, ...countProps, ...maxProps], () =>
        isRestockingAmmo(shipDriver.state) ? 'RESTOCKING' : 'IDLE',
    );
    const statusBlade = addTextBlade(pane, restockingProp, { label: 'Restock' }, panelCleanup.add);
    statusBlade.element.classList.add('status', 'tp-rotv', 'sw-mode');
    const applyRestockingTheme = () =>
        (statusBlade.element.dataset.status = isRestockingAmmo(shipDriver.state) ? 'OK' : '');
    panelCleanup.add(restockingProp.onChange(applyRestockingTheme));
    applyRestockingTheme();

    for (const group of ammoGroups(shipDriver.state.magazine.design)) {
        const groupFolder = addSubheader(pane, group.title, panelCleanup.add);
        for (const projectileKey of group.ammo) {
            // the bar spans the design's full stock, so a damaged magazine never reads as full;
            // the number reads against the stock the damaged magazine can still hold
            const designMax = shipDriver.state.magazine.design[`max_${projectileKey}`];
            const countProp = {
                ...readNumberProp(shipDriver, `/magazine/count_${projectileKey}`),
                range: [0, designMax] as const,
            };
            const heldMax = () => shipDriver.state.magazine.getMax(projectileKey);
            // shell counts run to thousands and only fit as a bare count; missile counts read against their stock
            const format = designMax >= 1000 ? String : (count: number) => `${count}/${heldMax()}`;
            const row = addInlineBarBlade(
                groupFolder,
                countProp,
                { label: ammoFamilyName(projectileKey), format },
                panelCleanup.add,
            );
            // amber once a quarter of the stock or less is left
            applyThresholdTheme(row.element, countProp, Math.floor(designMax / 4) + 1, -1, panelCleanup.add);
        }
    }
}
