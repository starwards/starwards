import { Destructors, ShipDriver } from '@starwards/core';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';
import { addSliderBlade } from '../panel';
import { readNumberProp } from '../property-wrappers';

export function warpWidget(shipDriver: ShipDriver): DashboardWidget {
    class WarpComponent {
        constructor(container: WidgetContainer, _: unknown) {
            drawWarpStatus(container, shipDriver);
        }
    }
    return {
        name: 'warp',
        type: 'component',
        component: WarpComponent,
        defaultProps: {},
    };
}
export function drawWarpStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Warp', container: container.getElement().get(0) });
    panelCleanup.add(() => pane.dispose());
    container.on('destroy', panelCleanup.destroy);
    addSliderBlade(pane, readNumberProp(shipDriver, '/warp/currentLevel'), { label: 'Actual' }, panelCleanup.add);
    addSliderBlade(pane, readNumberProp(shipDriver, '/warp/desiredLevel'), { label: 'Designated' }, panelCleanup.add);
}
