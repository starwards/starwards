import { Destructors, ShipDriver, WarpFrequency } from '@starwards/core';
import { addSliderBlade, addTextBlade } from '../panel';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
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

export function drawWarpStatus(container: WidgetContainer, shipDriver: ShipDriver) {
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Warp', container: container.getElement().get(0) });
    panelCleanup.add(() => pane.dispose());
    container.on('destroy', panelCleanup.destroy);
    addSliderBlade(pane, readNumberProp(shipDriver, '/warp/currentLevel'), { label: 'Actual LVL' }, panelCleanup.add);
    addSliderBlade(
        pane,
        readNumberProp(shipDriver, '/warp/desiredLevel'),
        { label: 'Designated LVL' },
        panelCleanup.add
    );
    const jammedProp = readProp(shipDriver, '/warp/jammed');
    const jamBlade = addTextBlade(
        pane,
        jammedProp,
        { label: 'Proximity Jam', format: (j) => (j ? 'JAMMED' : 'CLEAR') },
        panelCleanup.add
    );
    jamBlade.element.classList.add('status', 'tp-rotv'); // This allows overriding tweakpane theme for this folder
    const applyThemeToJammed = () => (jamBlade.element.dataset.status = shipDriver.state.warp.jammed ? 'WARN' : ''); // this will change tweakpane theme for this folder, see tweakpane.css
    panelCleanup.add(jammedProp.onChange(applyThemeToJammed));
    applyThemeToJammed();

    addTextBlade(
        pane,
        readProp<WarpFrequency>(shipDriver, '/warp/currentFrequency'),
        { format: (p: WarpFrequency) => WarpFrequency[p], label: 'Actual FRQ' },
        panelCleanup.add
    );
    addTextBlade(
        pane,
        readProp<WarpFrequency>(shipDriver, '/warp/desiredFrequency'),
        { format: (p: WarpFrequency) => WarpFrequency[p], label: 'Designated FRQ' },
        panelCleanup.add
    );
    addSliderBlade(
        pane,
        readNumberProp(shipDriver, '/warp/frequencyChange'),
        { label: 'Calibration' },
        panelCleanup.add
    );
}
