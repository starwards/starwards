import { addBarBlade, addInputBlade, addTextBlade } from '../panel/blades';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';
import { createWidgetPane } from '../panel';

export function tubesStatusWidget(shipDriver: ShipDriver): DashboardWidget {
    return {
        name: 'tubes',
        type: 'component',
        component: class {
            constructor(container: WidgetContainer, _: unknown) {
                drawTubesStatus(container, shipDriver);
            }
        },
        defaultProps: {},
    };
}

export function drawTubesStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Tubes Status');
    for (const tube of shipDriver.state.tubes) {
        const tubeFolder = pane.addFolder({
            title: tube.name,
            expanded: true,
        });
        panelCleanup.add(() => tubeFolder.dispose());
        const projectile = readProp(shipDriver, `/tubes/${tube.index}/projectile`);
        addTextBlade(tubeFolder, projectile, { label: 'ammo to use', disabled: true }, panelCleanup.add);
        const loadedProjectile = readProp(shipDriver, `/tubes/${tube.index}/loadedProjectile`);
        addTextBlade(tubeFolder, loadedProjectile, { label: 'ammo loaded', disabled: true }, panelCleanup.add);
        const loading = readNumberProp(shipDriver, `/tubes/${tube.index}/loading`);
        addBarBlade(tubeFolder, loading, { label: 'loading' }, panelCleanup.add);
        addInputBlade(
            tubeFolder,
            readProp(shipDriver, `/tubes/${tube.index}/loadAmmo`),
            { label: 'auto load' },
            panelCleanup.add,
        );
        if (tube.index < shipDriver.state.tubes.length - 1) {
            pane.addBlade({ view: 'separator' });
        }
    }
}
