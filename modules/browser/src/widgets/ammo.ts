import { Destructors, ShipDriver, projectileDesigns, projectileModels } from '@starwards/core';
import { abstractOnChange, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';
import { addTextBlade } from '../panel';

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
    const pane = new Pane({ title: 'Ammunition', container: container.getElement().get(0) });
    panelCleanup.add(() => pane.dispose());
    container.on('destroy', panelCleanup.destroy);
    for (const projectileKey of projectileModels) {
        const countProp = readProp<number>(shipDriver, `/magazine/count_${projectileKey}`);
        const maxProp = readProp<number>(shipDriver, `/magazine/design/max_${projectileKey}`);
        const capacityProp = readProp<number>(shipDriver, `/magazine/capacity`);
        const getText = () =>
            `${shipDriver.state.magazine.count_CannonShell} / ${shipDriver.state.magazine[`max_${projectileKey}`]}`;
        const prop = {
            onChange: (cb: () => unknown) => abstractOnChange([countProp, maxProp, capacityProp], getText, cb),
            getValue: getText,
        };
        addTextBlade(pane, prop, { label: projectileDesigns[projectileKey].name }, panelCleanup.add);
    }
}
