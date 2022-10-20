import { Panel, PropertyPanel } from '../panel';
import { readProp, readWriteProp } from '../property-wrappers';

import $ from 'jquery';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/core';

function addMapToPanel(panel: Panel, shipDriver: ShipDriver, pointerStr: string) {
    const p = readProp<Map<string, number>>(shipDriver, pointerStr);
    const fields = new Set(p.getValue().keys());

    for (const constName of fields) {
        panel.addConfig(constName, readWriteProp(shipDriver, pointerStr + '/' + constName));
    }
    p.onChange(() => {
        for (const constName of p.getValue().keys()) {
            if (!fields.has(constName)) {
                fields.add(constName);
                panel.addConfig(constName, readWriteProp(shipDriver, pointerStr + '/' + constName));
            }
        }
    });
}

export function shipConstantsWidget(shipDriver: ShipDriver): DashboardWidget {
    function makeShipComponent(container: Container) {
        const rootPanel = new PropertyPanel(container);
        // TODO add cleanups for folders
        addMapToPanel(rootPanel.addFolder('main'), shipDriver, `/modelParams/params`);
        if (shipDriver.state.chainGun) {
            addMapToPanel(rootPanel.addFolder('chainGun'), shipDriver, `/chainGun/modelParams/params`);
        }
        rootPanel.addImportExport();
        const cleanup = () => {
            container.off('destroy', cleanup);
            rootPanel.destroy();
        };
        container.on('destroy', cleanup);
    }
    function makeConstantsHeaders(container: Container): Array<JQuery<HTMLElement>> {
        const refresh = $('<i class="lm_controls tiny material-icons">refresh</i>');
        refresh.mousedown(() => {
            container.emit('destroy');
            void makeShipComponent(container);
        });
        return [refresh];
    }
    class ShipConstantsComponent {
        constructor(container: Container, _: unknown) {
            void makeShipComponent(container);
        }
    }

    return {
        name: 'ship constants',
        type: 'component',
        component: ShipConstantsComponent,
        makeHeaders: makeConstantsHeaders,
        defaultProps: {},
    };
}
