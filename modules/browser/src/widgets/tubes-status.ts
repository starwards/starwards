import { ClusterWarheadMode, ShipDriver, clusterWarheadModes, getDirectionConfigFromAngle } from '@starwards/core';
import {
    addAnnunciatorBlade,
    addListBlade,
    addSegmentedBarBlade,
    addSubheader,
    createWidgetPane,
    setAnnunciatorColumns,
} from '../panel';
import { aggregate, readNumberProp, readProp, readWriteProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';
import { addMountAmmoRows } from './mount-readout';

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
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Tubes');
    for (const tube of shipDriver.state.tubes) {
        const tubeFolder = addSubheader(
            pane,
            `T${tube.index} · ${getDirectionConfigFromAngle(tube.fittedBearing)}`,
            panelCleanup.add,
        );
        addMountAmmoRows(tubeFolder, shipDriver, `/tubes/${tube.index}`, panelCleanup);
        // cluster munitions carry two selectable warheads; tubes that cannot load them have no mode to pick
        if (tube.design.isAmmoEnabled('ClusterMissile')) {
            addListBlade(
                tubeFolder,
                readWriteProp<ClusterWarheadMode>(shipDriver, `/tubes/${tube.index}/clusterWarhead`),
                {
                    label: 'Warhead',
                    options: clusterWarheadModes.map((mode) => ({ value: mode, text: mode })),
                },
                panelCleanup.add,
            ).element.classList.add('sw-mode');
        }
        addSegmentedBarBlade(tubeFolder, readNumberProp(shipDriver, `/tubes/${tube.index}/loading`), panelCleanup.add);
        const loadedProp = readProp<string>(shipDriver, `/tubes/${tube.index}/loadedProjectile`);
        addAnnunciatorBlade(
            tubeFolder,
            aggregate([loadedProp], () => (loadedProp.getValue() ?? 'None') !== 'None'),
            { label: 'Ready' },
            panelCleanup.add,
        );
        addAnnunciatorBlade(
            tubeFolder,
            readWriteProp(shipDriver, `/tubes/${tube.index}/safetyLocked`),
            { label: 'Safe', tone: 'caution' },
            panelCleanup.add,
        );
        addAnnunciatorBlade(
            tubeFolder,
            readProp(shipDriver, `/tubes/${tube.index}/loadAmmo`),
            { label: 'Auto' },
            panelCleanup.add,
        );
        setAnnunciatorColumns(tubeFolder, 3);
    }
}
