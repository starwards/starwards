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
        (name: string, value: number) => shipRoom.send('setConstant', { name, value })
    );
    addMapToPanel(
        () => shipRoom.state.chainGun.constants,
        rootPanel.addFolder('chainGun'),
        (name: string, value: number) => shipRoom.send('setChainGunConstant', { name, value })
    );
    triggerEverythingOnEvent(shipRoom.state.events, ['constants', 'chainGun.constants'], viewModelChanges);
    const cleanup = () => {
        container.off('destroy', cleanup);
        rootPanel.destroy();
    };
    container.on('destroy', cleanup);
}
function shipConstantsComponent(container: Container, p: Props) {
    void makeShipComponent(container, p);
}

function addMapToPanel(
    getConstants: () => MapSchema<number>,
    panel: Panel,
    onChange: (name: string, value: number) => void
) {
    const initConst = (_: unknown, name: string) => {
        const val = getConstants().get(name);
        panel.addProperty({
            name,
            getValue: () => getConstants().get(name),
            range: [val / 2, val * 2],
            onChange: (value: number) => onChange(name, value),
        });
    };
    getConstants().onAdd = initConst;
    for (const constName of getConstants().keys()) {
        initConst(0, constName);
    }
}

function triggerEverythingOnEvent(
    stateEvents: EventEmitter<string | symbol, unknown>,
    constantsChangeEventNames: string[],
    viewModelChanges: EventEmitter<string | symbol, unknown>
) {
    // lazy hack: just update everything when a constant changes
    for (const constantsChangeEventName of constantsChangeEventNames) {
        stateEvents.on(constantsChangeEventName, () => {
            for (const eventName of viewModelChanges.eventNames()) {
                viewModelChanges.emit(eventName);
            }
        });
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
    component: shipConstantsComponent,
    makeHeaders: makeConstantsHeaders,
    defaultProps: {},
};
