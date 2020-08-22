import { MapSchema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getShipRoom } from '../client';
import { Panel, PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';
import $ from 'jquery';

async function makeShipComponent(container: Container, p: Props) {
    const shipRoom = await getShipRoom(p.shipId);
    const viewModelChanges = new EventEmitter();
    const rootPanel = new PropertyPanel(viewModelChanges);
    rootPanel.init(container);
    addMapToPanel(
        () => shipRoom.state.constants,
        rootPanel.addFolder('main'),
        (name: string, value: number) => shipRoom.send('setConstant', { name, value }),
        shipRoom.state.events,
        'constants',
        viewModelChanges
    );
    addMapToPanel(
        () => shipRoom.state.chainGun.constants,
        rootPanel.addFolder('chainGun'),
        (name: string, value: number) => shipRoom.send('setChainGunConstant', { name, value }),
        shipRoom.state.events,
        'chainGun.constants',
        viewModelChanges
    );
    const cleanup = () => {
        container.off('destroy', cleanup);
        rootPanel.destroy();
    };
    container.on('destroy', cleanup);
}
function shipConstantsComponent(container: Container, p: Props) {
    makeShipComponent(container, p);
}

function addMapToPanel(
    getConstants: () => MapSchema<number>,
    panel: Panel,
    onChange: (name: string, value: number) => void,
    stateEvents: EventEmitter,
    constantsChangeEventName: string,
    viewModelChanges: EventEmitter
) {
    getConstants().onAdd = (_, name) => {
        const val = getConstants().get(name);
        panel.addProperty(
            name,
            () => getConstants().get(name),
            [val / 2, val * 2],
            (value: number) => onChange(name, value)
        );
    };
    for (const constName in getConstants().keys()) {
        if (typeof getConstants().get(constName) === 'number') {
            getConstants().onAdd!(0, constName);
        }
    }
    // lazy hack: just update everything when a constant changes
    stateEvents.on(constantsChangeEventName, () => {
        for (const eventName of viewModelChanges.eventNames()) {
            viewModelChanges.emit(eventName);
        }
    });
}

export function makeConstantsHeaders(container: Container, p: Props): Array<JQuery<HTMLElement>> {
    const refresh = $('<i class="lm_controls tiny material-icons">refresh</i>');
    refresh.mousedown(() => {
        container.emit('destroy');
        makeShipComponent(container, p);
    });
    return [refresh];
}
export type Props = { shipId: string };
export const shipConstantsWidget: DashboardWidget<Props> = {
    name: 'ship constants',
    type: 'component',
    component: shipConstantsComponent,
    makeHeaders: makeConstantsHeaders,
    defaultProps: {},
};
