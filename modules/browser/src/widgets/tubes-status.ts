import { ClusterWarheadMode, ShipDriver, clusterWarheadModes } from '@starwards/core';
import { addBarBlade, addInputBlade, addListBlade, addTextBlade } from '../panel/blades';
import { readNumberProp, readProp, readWriteProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
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
        // cluster munitions carry two selectable warheads; tubes that cannot load them have no mode to pick
        if (tube.design.isAmmoEnabled('ClusterMissile')) {
            addListBlade(
                tubeFolder,
                readWriteProp<ClusterWarheadMode>(shipDriver, `/tubes/${tube.index}/clusterWarhead`),
                {
                    label: 'cluster warhead',
                    options: clusterWarheadModes.map((mode) => ({ value: mode, text: mode })),
                },
                panelCleanup.add,
            );
        }
        if (tube.index < shipDriver.state.tubes.length - 1) {
            pane.addBlade({ view: 'separator' });
        }
    }
}
