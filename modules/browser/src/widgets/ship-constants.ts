import { NumberMapDriver, ShipDriver } from '../driver';
import { Panel, PropertyPanel } from '../panel';

import $ from 'jquery';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { RoomName } from '@starwards/model';

function addMapToPanel(panel: Panel, p: NumberMapDriver<RoomName, unknown, string>) {
    const fields = new Set(p.fields);
    for (const constName of p.fields) {
        panel.addConfig(constName, p.getApi(constName));
    }
    p.onChange(() => {
        for (const constName of p.fields) {
            if (!fields.has(constName)) {
                fields.add(constName);
                panel.addConfig(constName, p.getApi(constName));
            }
        }
    });
}

export function shipConstantsWidget(shipDriver: ShipDriver): DashboardWidget {
    function makeShipComponent(container: Container) {
        const rootPanel = new PropertyPanel(container);
        shipDriver.constants;
        // TODO add cleanups for folders
        addMapToPanel(rootPanel.addFolder('main'), shipDriver.constants);
        addMapToPanel(rootPanel.addFolder('chainGun'), shipDriver.chainGunConstants);
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
