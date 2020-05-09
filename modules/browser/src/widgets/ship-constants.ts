import { Container } from 'golden-layout';
import { getRoomById } from '../client';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';
import EventEmitter from 'eventemitter3';

function shipConstantsComponent(container: Container, p: Props) {
    getRoomById('ship', p.shipId).then((shipRoom) => {
        shipRoom.state.events.once('constants', () => {
            const viewModelChanges = new EventEmitter();
            const panel = new PropertyPanel(viewModelChanges);
            panel.init(container);

            shipRoom.state.constants.onAdd = (_, name) => {
                const val = shipRoom.state.constants[name];
                panel.addProperty(
                    name,
                    () => shipRoom.state.constants[name],
                    [val / 2, val * 2],
                    (value) => {
                        shipRoom.send('SetConstant', { name, value });
                    }
                );
            };

            for (const constName in shipRoom.state.constants) {
                if (typeof shipRoom.state.constants[constName] === 'number') {
                    shipRoom.state.constants.onAdd(0, constName);
                }
            }

            // lazy hack: just update everything when a constant changes
            shipRoom.state.events.on('constants', () => {
                for (const eventName of viewModelChanges.eventNames()) {
                    viewModelChanges.emit(eventName);
                }
            });
        });
    });
}

export type Props = { shipId: string };
export const shipConstantsWidget: DashboardWidget<Props> = {
    name: 'ship constants',
    type: 'component',
    component: shipConstantsComponent,
    defaultProps: {},
};
