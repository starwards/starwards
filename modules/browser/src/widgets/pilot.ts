import '@maulingmonkey/gamepad';
import { Container } from 'golden-layout';
import { getRoomById } from '../client';
import { PropertyPanel } from '../property-panel';
import { DashboardWidget } from './dashboard';
// github.com/MaulingMonkey/mmk.gamepad

function pilotComponent(container: Container, p: Props) {
    getRoomById('ship', p.shipId).then((shipRoom) => {
        const panel = new PropertyPanel(shipRoom.state.events);
        panel.init(container);
        panel.addProperty(
            'targetTurnSpeed',
            () => shipRoom.state.targetTurnSpeed,
            [-90, 90],
            (value) => {
                shipRoom.send('SetTargetTurnSpeed', { value });
            },
            {
                gamepadIndex: 0,
                axisIndex: 5,
                deadzone: [-0.1, 0.05],
            }
        );
        panel.addProperty('energy', () => shipRoom.state.targetTurnSpeed, [0, 1000]);
    });
}

export type Props = { shipId: string };
export const pilotWidget: DashboardWidget<Props> = {
    name: 'pilot',
    type: 'component',
    component: pilotComponent,
    defaultProps: {},
};
