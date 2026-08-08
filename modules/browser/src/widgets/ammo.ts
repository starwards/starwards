import { ShipDriver, ammoDesigns, ammoTypes, isRestockingAmmo } from '@starwards/core';
import { addTextBlade, createWidgetPane } from '../panel';
import { aggregate, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
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
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Ammunition');

    // isRestockingAmmo has no synced gameField of its own (AmmoManager's fractional accrual is
    // deliberately not player-facing) — it's a pure function of docking mode plus every ammo
    // type's count/max, so it's re-derived from those already-synced fields on each of their
    // changes rather than cached, the same rule the ECR repair-queue catalog applies to
    // `dynamicDuration`.
    const dockingModeProp = readProp<number>(shipDriver, '/docking/mode');
    const magazineCapacityProp = readProp<number>(shipDriver, '/magazine/capacity');
    const countProps = ammoTypes.map((at) => readProp<number>(shipDriver, `/magazine/count_${at}`));
    const maxProps = ammoTypes.map((at) => readProp<number>(shipDriver, `/magazine/design/max_${at}`));
    const restockingProp = aggregate([dockingModeProp, magazineCapacityProp, ...countProps, ...maxProps], () =>
        isRestockingAmmo(shipDriver.state) ? 'RESTOCKING' : 'IDLE',
    );
    const statusBlade = addTextBlade(pane, restockingProp, { label: 'Restock' }, panelCleanup.add);
    statusBlade.element.classList.add('status', 'tp-rotv');
    const applyRestockingTheme = () =>
        (statusBlade.element.dataset.status = isRestockingAmmo(shipDriver.state) ? 'OK' : '');
    panelCleanup.add(restockingProp.onChange(applyRestockingTheme));
    applyRestockingTheme();

    for (const group of ammoGroups(shipDriver.state.magazine.design)) {
        const groupFolder = pane.addFolder({ title: group.title, expanded: true });
        panelCleanup.add(() => groupFolder.dispose());
        for (const projectileKey of group.ammo) {
            const countProp = readProp<number>(shipDriver, `/magazine/count_${projectileKey}`);
            const maxProp = readProp<number>(shipDriver, `/magazine/design/max_${projectileKey}`);
            const capacityProp = readProp<number>(shipDriver, `/magazine/capacity`);
            const getText = () =>
                `${shipDriver.state.magazine[`count_${projectileKey}`]} / ${
                    shipDriver.state.magazine[`max_${projectileKey}`]
                }`;
            const prop = aggregate([countProp, maxProp, capacityProp], getText);
            addTextBlade(groupFolder, prop, { label: ammoDesigns[projectileKey].name }, panelCleanup.add);
        }
    }
}
