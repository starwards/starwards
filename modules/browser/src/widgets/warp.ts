import { ShipDriver, WarpFrequency } from '@starwards/core';
import { addAnnunciatorBlade, addBarBlade, addTextBlade, createWidgetPane, setAnnunciatorColumns } from '../panel';
import { aggregate, readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { WidgetContainer } from '../container';

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

const formatLevel = (level: number | undefined) => String(Number((level ?? 0).toFixed(1)));
const formatFrequency = (p: WarpFrequency) => WarpFrequency[p];

export function drawWarpStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const { pane, cleanup: panelCleanup } = createWidgetPane(container, 'Warp');
    const currentLevel = readNumberProp(shipDriver, '/warp/currentLevel');
    const desiredLevel = readNumberProp(shipDriver, '/warp/desiredLevel');
    addTextBlade(
        pane,
        aggregate(
            [currentLevel, desiredLevel],
            () => `${formatLevel(currentLevel.getValue())} / ${formatLevel(desiredLevel.getValue())}`,
        ),
        { label: 'level' },
        panelCleanup.add,
    ).element.classList.add('sw-big');
    addTextBlade(
        pane,
        readProp<WarpFrequency>(shipDriver, '/warp/currentFrequency'),
        { format: formatFrequency, label: 'frequency' },
        panelCleanup.add,
    );
    addTextBlade(
        pane,
        readProp<WarpFrequency>(shipDriver, '/warp/standbyFrequency'),
        { format: formatFrequency, label: 'designated' },
        panelCleanup.add,
    );
    addBarBlade(
        pane,
        readNumberProp(shipDriver, '/warp/frequencyChange'),
        { label: 'calibration', format: (c: number) => `${Math.round(c * 100)}%` },
        panelCleanup.add,
    );
    addAnnunciatorBlade(
        pane,
        readProp<boolean>(shipDriver, '/warp/jammed'),
        { label: 'Jammed', tone: 'caution' },
        panelCleanup.add,
    );
    addAnnunciatorBlade(
        pane,
        readProp<boolean>(shipDriver, '/warp/changingFrequency'),
        { label: 'Calib' },
        panelCleanup.add,
    );
    setAnnunciatorColumns(pane, 2);
}
