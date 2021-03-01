import { DriverNumericApi, NumberMapDriver } from '../drivers/utils';
import { Panel, PropertyPanel } from '../property-panel';

import $ from 'jquery';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { ShipDriver } from '../drivers/ship-driver';

function makeShipComponent(container: Container, p: Props) {
    const driver = p.shipDriver;
    const rootPanel = new PropertyPanel();
    rootPanel.init(container);
    driver.constants;
    addMapToPanel(rootPanel.addFolder('main'), driver.constants);
    addMapToPanel(rootPanel.addFolder('chainGun'), driver.chainGunConstants);
    const cleanup = () => {
        container.off('destroy', cleanup);
        rootPanel.destroy();
    };
    container.on('destroy', cleanup);
}
class ShipConstantsComponent {
    constructor(container: Container, p: Props) {
        void makeShipComponent(container, p);
    }
}

function addMapToPanel(panel: Panel, p: NumberMapDriver) {
    const initConst = (name: string, api: DriverNumericApi) => {
        panel.addProperty(name, api);
    };
    p.onAdd = initConst;
    for (const constName of p.map.keys()) {
        initConst(constName, p.getApi(constName));
    }
}

export function makeConstantsHeaders(container: Container, p: Props): Array<JQuery<HTMLElement>> {
    const refresh = $('<i class="lm_controls tiny material-icons">refresh</i>');
    refresh.mousedown(() => {
        container.emit('destroy');
        void makeShipComponent(container, p);
    });
    return [refresh];
}
export type Props = { shipDriver: ShipDriver };
export const shipConstantsWidget: DashboardWidget<Props> = {
    name: 'ship constants',
    type: 'component',
    component: ShipConstantsComponent,
    makeHeaders: makeConstantsHeaders,
    defaultProps: {},
};
