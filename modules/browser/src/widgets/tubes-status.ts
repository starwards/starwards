import { Destructors, ShipDriver, getDirectionConfigFromAngle } from '@starwards/core';
import { addSliderBlade, addTextBlade } from '../panel/blades';
import { readNumberProp, readProp } from '../property-wrappers';

import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { WidgetContainer } from '../container';

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
    const panelCleanup = new Destructors();
    const pane = new Pane({ title: 'Tubes', container: container.getElement().get(0) });
    panelCleanup.add(() => {
        pane.dispose();
    });
    container.on('destroy', panelCleanup.destroy);
    for (const tube of shipDriver.state.tubes) {
        const tubeFolder = pane.addFolder({
            title: tube.name,
            expanded: true,
        });
        panelCleanup.add(() => tubeFolder.dispose());
        const projectile = readProp(shipDriver, `/tubes/${tube.index}/projectile`);
        addTextBlade(tubeFolder, projectile, { label: 'ammo type', disabled: true }, panelCleanup.add);
        const cooldown = readNumberProp(shipDriver, `/tubes/${tube.index}/cooldown`);
        addSliderBlade(tubeFolder, cooldown, { label: 'cooldown', disabled: true }, panelCleanup.add);
        const { getValue, onChange } = readProp<number>(shipDriver, `/tubes/${tube.index}/angle`);
        const angle = { onChange, getValue: () => getDirectionConfigFromAngle(getValue()) };
        addTextBlade(tubeFolder, angle, { label: 'angle', disabled: true }, panelCleanup.add);
    }
}
