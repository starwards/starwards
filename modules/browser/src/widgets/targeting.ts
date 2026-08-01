import { addInputBlade, addTextBlade, createWidgetPane } from '../panel';

import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';
import { WidgetContainer } from '../container';
import { readProp } from '../property-wrappers';

export function targetingWidget(shipDriver: ShipDriver): DashboardWidget {
    class AmmoComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawTargetingStatus(container, shipDriver);
        }
    }
    return {
        name: 'targeting',
        type: 'component',
        component: AmmoComponent,
        defaultProps: {},
    };
}
export function drawTargetingStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Targeting');
    addTextBlade(pane, readProp(shipDriver, '/weaponsTarget/targetId'), { label: 'target' }, panelCleanup.add);
    addInputBlade(pane, readProp(shipDriver, '/weaponsTarget/shipOnly'), { label: 'Ship Only' }, panelCleanup.add);
    addInputBlade(pane, readProp(shipDriver, '/weaponsTarget/enemyOnly'), { label: 'Enemy Only' }, panelCleanup.add);
    addInputBlade(
        pane,
        readProp(shipDriver, '/weaponsTarget/shortRangeOnly'),
        { label: 'Short Range' },
        panelCleanup.add,
    );
}
