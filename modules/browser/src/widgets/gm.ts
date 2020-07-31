import { Container } from 'golden-layout';
import * as PIXI from 'pixi.js';
import { getGlobalRoom } from '../client';
import { DashboardWidget } from './dashboard';
import { makeRadarHeaders } from './radar';
import { CameraView } from '../radar/camera-view';
import { Camera } from '../radar/camera';
import { GridLayer } from '../radar/grid-layer';
import { InteractiveLayer } from '../radar/interactive-layer';
import { ObjectsLayer } from '../radar/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import { blipRenderer } from '../radar/blip-renderer';
// import { velocityRenderer } from '../radar/velocity-renderer';

// TODO: use https://github.com/dataarts/dat.gui
function gmComponent(container: Container, state: { zoom: number }) {
    const camera = new Camera();
    camera.bindZoom(container, state);
    container.getElement().bind('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        camera.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
    });
    PIXI.Loader.shared.load(async () => {
        const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
        const grid = new GridLayer(root);
        root.addLayer(grid.renderRoot);
        const room = await getGlobalRoom('space');
        const selectionContainer = new SelectionContainer(room.state);
        const selection = new InteractiveLayer(root, room, selectionContainer);
        const blipLayer = new ObjectsLayer(root, room, blipRenderer, selectionContainer);
        root.addLayer(blipLayer.renderRoot);
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
