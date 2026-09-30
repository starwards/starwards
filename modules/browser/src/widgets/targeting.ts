import { addAnnunciatorBlade, addTextBlade, createWidgetPane, setAnnunciatorColumns } from '../panel';

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
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Target');
    const track = addTextBlade(
        pane,
        readProp<string | null>(shipDriver, '/weaponsTarget/targetId'),
        { label: 'Track', format: (id: string | null) => id || '—' },
        panelCleanup.add,
    );
    track.element.classList.add('sw-big');
    // real field path (not a ShipState delegate getter) -- wireEvents() only emits change events
    // for literal @gameField paths, so a derived-getter pointer would never live-update (see /speed).
    addTextBlade(pane, readProp<number>(shipDriver, '/spaceship/hitsLanded'), { label: 'Hits' }, panelCleanup.add);
    addAnnunciatorBlade(pane, readProp(shipDriver, '/weaponsTarget/shipOnly'), { label: 'Ships' }, panelCleanup.add);
    addAnnunciatorBlade(pane, readProp(shipDriver, '/weaponsTarget/enemyOnly'), { label: 'Enemy' }, panelCleanup.add);
    addAnnunciatorBlade(
        pane,
        readProp(shipDriver, '/weaponsTarget/shortRangeOnly'),
        { label: 'Short' },
        panelCleanup.add,
    );
    setAnnunciatorColumns(pane, 3);
}
