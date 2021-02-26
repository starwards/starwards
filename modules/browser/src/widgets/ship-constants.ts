import { GameRoom, MappedPropertyCommand, cmdSender, shipProperties } from '@starwards/model';
import { Panel, PropertyPanel } from '../property-panel';

import $ from 'jquery';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { getShipRoom } from '../client';

async function makeShipComponent(container: Container, p: Props) {
    const shipRoom = await getShipRoom(p.shipId);
    const rootPanel = new PropertyPanel();
    rootPanel.init(container);
    addMapToPanel(rootPanel.addFolder('main'), shipProperties.constants, shipRoom);
    addMapToPanel(rootPanel.addFolder('chainGun'), shipProperties.chainGunConstants, shipRoom);
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

function addMapToPanel(panel: Panel, p: MappedPropertyCommand<'ship'>, shipRoom: GameRoom<'ship'>) {
    const map = p.getValue(shipRoom.state);
    const initConst = (_: unknown, name: string) => {
        const sender = cmdSender(shipRoom, p);
        const val = map.get(name);
        panel.addProperty(name, {
            getValue: () => map.get(name),
            range: [val / 2, val * 2],
            onChange: (value: number) => sender([name, value]),
        });
    };
    map.onAdd = initConst;
    for (const constName of map.keys()) {
        initConst(0, constName);
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
export type Props = { shipId: string };
export const shipConstantsWidget: DashboardWidget<Props> = {
    name: 'ship constants',
    type: 'component',
    component: ShipConstantsComponent,
    makeHeaders: makeConstantsHeaders,
    defaultProps: {},
};
