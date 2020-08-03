import { MapSchema } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';
import { getShipRoom } from '../client';
import { Panel, PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';

function shipConstantsComponent(container: Container, p: Props) {
    (async () => {
        const shipRoom = await getShipRoom(p.shipId);
        const viewModelChanges = new EventEmitter();
        const rootPanel = new PropertyPanel(viewModelChanges);
        rootPanel.init(container);
        container.on('destroy', () => rootPanel.destroy());
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
    })();
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
        const val = getConstants()[name];
        panel.addProperty(
            name,
            () => getConstants()[name],
            [val / 2, val * 2],
            (value: number) => onChange(name, value)
        );
    };
    for (const constName in getConstants()) {
        if (typeof getConstants()[constName] === 'number') {
            getConstants().onAdd(0, constName);
        }
    }
    // lazy hack: just update everything when a constant changes
    stateEvents.on(constantsChangeEventName, () => {
        for (const eventName of viewModelChanges.eventNames()) {
            viewModelChanges.emit(eventName);
        }
    });
}

export type Props = { shipId: string };
export const shipConstantsWidget: DashboardWidget<Props> = {
    name: 'ship constants',
    type: 'component',
    component: shipConstantsComponent,
    defaultProps: {},
};
