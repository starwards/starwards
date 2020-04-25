import { Container } from 'golden-layout';
import * as PIXI from 'pixi.js';
import { getGlobalRoom } from '../client';
import { DashboardWidget } from './dashboard';
import { makeRadarHeaders } from './radar';
import { CameraView } from '../radar/camera-view';
import { Camera } from '../radar/camera';
import { GridLayer } from '../radar/grid-layer';
import { InteractiveLayer } from '../radar/interactive-layer';
import { BlipsLayer } from '../radar/blips-layer';
import { SelectionContainer } from '../radar/selection-container';

// TODO: use https://github.com/dataarts/dat.gui
function gmComponent(container: Container, state: { zoom: number }) {
    const camera = new Camera();
    camera.bindZoom(container, state);
    PIXI.Loader.shared.load(async () => {
        const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
        const grid = new GridLayer(root);
        root.addLayer(grid.renderRoot);
        const room = await getGlobalRoom('space');
        const selectionContainer = new SelectionContainer(room);
        const selection = new InteractiveLayer(root, room, selectionContainer);
        const blipper = new BlipsLayer(root, room, selectionContainer);
        root.addLayer(blipper.renderRoot);
        root.addLayer(selection.renderRoot);
    });
}

export const gmWidget: DashboardWidget<{ zoom: number }> = {
    name: 'GM',
    type: 'component',
    component: gmComponent,
    defaultProps: { zoom: 1 },
    makeHeaders: makeRadarHeaders,
};
