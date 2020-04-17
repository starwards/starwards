import { Container } from 'golden-layout';
import * as PIXI from 'pixi.js';
import { getRoom } from '../../client';
import { DashboardWidget } from '../dashboard';
import { makeRadarHeaders } from '../radar';
import { BaseContainer } from '../../radar/base-container';
import { PontOfView } from '../../radar/point-of-view';
import { Radar } from '../../radar/radar';
import { SelectionLayer } from '../../radar/selection-layer';
// TODO: use https://github.com/dataarts/dat.gui
function gmComponent(container: Container, state: { zoom: number }) {
    const pov = PontOfView.makeBoundPointOfView(container, state);
    PIXI.Loader.shared.load(() => {
        const base = new BaseContainer({ backgroundColor: 0x0f0f0f }, pov, container);
        // TODO: single app, multiple containers
        // https://stackoverflow.com/questions/40376042/multiple-canvas-in-pixijs
        const radar = new Radar(base, getRoom('space'));
        const selection = new SelectionLayer(base);
    });
}

export const gmWidget: DashboardWidget<{ zoom: number }> = {
    name: 'GM',
    type: 'component',
    component: gmComponent,
    initialState: { zoom: 1 },
    makeHeaders: makeRadarHeaders,
};
