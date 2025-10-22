import { Destructors, ShipDriver, projectileDesigns, projectileModels } from '@starwards/core';
import { addTextBlade, createPane } from '../panel';
import { aggregate, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

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
    const panelCleanup = new Destructors();
    const pane = createPane({ title: 'Ammunition', container: container.getElement().get(0) });
    panelCleanup.add(() => pane.dispose());
    container.on('destroy', panelCleanup.destroy);
    for (const projectileKey of projectileModels) {
        const countProp = readProp<number>(shipDriver, `/magazine/count_${projectileKey}`);
        const maxProp = readProp<number>(shipDriver, `/magazine/design/max_${projectileKey}`);
        const capacityProp = readProp<number>(shipDriver, `/magazine/capacity`);
        const getText = () =>
            `${shipDriver.state.magazine[`count_${projectileKey}`]} / ${
                shipDriver.state.magazine[`max_${projectileKey}`]
            }`;
        const prop = aggregate([countProp, maxProp, capacityProp], getText);
        addTextBlade(pane, prop, { label: projectileDesigns[projectileKey].name }, panelCleanup.add);
    }
}
