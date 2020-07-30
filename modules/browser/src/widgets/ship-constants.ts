import { Container } from 'golden-layout';
import { getRoomById } from '../client';
import { PropertyPanel, Panel } from '../property-panel';
import { DashboardWidget } from './dashboard';
import EventEmitter from 'eventemitter3';
import { MapSchema } from '@colyseus/schema';
import { waitForEvents } from '../async-utils';

function shipConstantsComponent(container: Container, p: Props) {
    (async () => {
        const shipRoom = await getRoomById('ship', p.shipId);
        await waitForEvents(shipRoom.state.events, ['constants', 'autoCannon']);
        const viewModelChanges = new EventEmitter();
        const rootPanel = new PropertyPanel(viewModelChanges);
        rootPanel.init(container);
        container.on('destroy', () => rootPanel.destroy());
        addMapToPanel(
            () => shipRoom.state.constants,
            rootPanel,
            (name: string, value: number) => shipRoom.send('setConstant', { name, value }),
            shipRoom.state.events,
            'constants',
            viewModelChanges
        );
        addMapToPanel(
            () => shipRoom.state.autoCannon.constants,
            rootPanel.addFolder('autoCannon'),
            (name: string, value: number) => shipRoom.send('setCannonConstant', { name, value }),
            shipRoom.state.events,
            'autoCannon.constants',
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
