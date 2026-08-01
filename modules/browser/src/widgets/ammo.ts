import { ShipDriver, ammoDesigns } from '@starwards/core';
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
