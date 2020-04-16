import { Container } from 'golden-layout';
import { DashboardWidget } from '../dashboard';
import { makeRadarHeaders, radarComponent } from '../radar';

function gmComponent(container: Container, state: { zoom: number }) {
    radarComponent(container, state);
}

export const gmWidget: DashboardWidget<{ zoom: number }> = {
    name: 'GM',
    type: 'component',
    component: gmComponent,
    initialState: { zoom: 1 },
    makeHeaders: makeRadarHeaders,
};
