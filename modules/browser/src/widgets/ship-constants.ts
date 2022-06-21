import { NumberMapDriver, ShipDriver } from '../driver';
import { Panel, PropertyPanel } from '../property-panel';

import $ from 'jquery';
import { BaseApi } from '../driver/utils';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';

function addMapToPanel(panel: Panel, p: NumberMapDriver) {
    const initConst = (name: string, api: BaseApi<number>) => {
        panel.addConfig(name, api);
    };
    p.onAdd = initConst;
    for (const constName of p.map.keys()) {
        initConst(constName, p.getApi(constName));
    }
}

export function shipConstantsWidget(shipDriver: ShipDriver): DashboardWidget {
    function makeShipComponent(container: Container) {
        const rootPanel = new PropertyPanel(container);
        shipDriver.constants;
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
