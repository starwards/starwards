import { Destructors, ShipDriver, getDirectionConfigFromAngle } from '@starwards/core';
import { addSliderBlade, addTextBlade } from '../panel/blades';
import { readNumberProp, readProp } from '../property-wrappers';

import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';

export function tubesStatusWidget(shipDriver: ShipDriver): DashboardWidget {
    class TubesStatusWidget {
        private pane: Pane;
        private panelCleanup = new Destructors();
        constructor(container: Container, _: unknown) {
            this.pane = new Pane({ container: container.getElement().get(0) });
            this.panelCleanup.add(() => {
                this.pane.dispose();
            });
            container.on('destroy', this.panelCleanup.destroy);
            for (const tube of shipDriver.state.tubes) {
                const tubeFolder = this.pane.addFolder({
                    title: tube.name,
                    expanded: true,
                });
                this.panelCleanup.add(() => tubeFolder.dispose());
                const projectile = readProp(shipDriver, `/tubes/${tube.index}/projectile`);
                addTextBlade(tubeFolder, projectile, { label: 'ammo type', disabled: true }, this.panelCleanup.add);
                const cooldown = readNumberProp(shipDriver, `/tubes/${tube.index}/cooldown`);
                addSliderBlade(tubeFolder, cooldown, { label: 'cooldown', disabled: true }, this.panelCleanup.add);
                const { getValue, onChange } = readProp<number>(shipDriver, `/tubes/${tube.index}/angle`);
                const angle = { onChange, getValue: () => getDirectionConfigFromAngle(getValue()) };
                addTextBlade(tubeFolder, angle, { label: 'angle', disabled: true }, this.panelCleanup.add);
            }
        }
    }
    return {
        name: 'pilot',
        type: 'component',
        component: TubesStatusWidget,
        defaultProps: {},
    };
}
