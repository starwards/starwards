import { Destructors, ShipDriver, cannonShell } from '@starwards/core';
import { abstractOnChange, readProp } from '../property-wrappers';

import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { Pane } from 'tweakpane';
import { addTextBlade } from '../panel';

export function ammoWidget(shipDriver: ShipDriver): DashboardWidget {
    class AmmoComponent {
        private pane: Pane;
        private panelCleanup = new Destructors();
        constructor(container: Container, _: unknown) {
            this.pane = new Pane({ container: container.getElement().get(0) });
            this.panelCleanup.add(() => {
                this.pane.dispose();
            });
            container.on('destroy', this.panelCleanup.destroy);

            // cannonShell

            const cannonShellsProp = readProp<number>(shipDriver, `/magazine/count_CannonShell`);
            const maxCannonShellsProp = readProp<number>(shipDriver, `/magazine/design/max_CannonShell`);
            const capacityProp = readProp<number>(shipDriver, `/magazine/capacity`);
            const getText = () =>
                `${shipDriver.state.magazine.count_CannonShell} / ${shipDriver.state.magazine.max_CannonShell}`;
            const prop = {
                onChange: (cb: () => unknown) =>
                    abstractOnChange([cannonShellsProp, maxCannonShellsProp, capacityProp], getText, cb),
                getValue: getText,
            };
            addTextBlade(this.pane, prop, { label: cannonShell.name }, this.panelCleanup.add);
        }
    }
    return {
        name: 'ammo',
        type: 'component',
        component: AmmoComponent,
        defaultProps: {},
    };
}
