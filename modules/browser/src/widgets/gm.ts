import * as PIXI from 'pixi.js';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { FragCounter } from './frag';
import { GridLayer } from '../radar/grid-layer';
import { InteractiveLayer } from '../radar/interactive-layer';
import { ObjectsLayer } from '../radar/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import { blipRenderer } from '../radar/blip-renderer';
import { getGlobalRoom } from '../client';
import { makeRadarHeaders } from './radar';

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
    async function init() {
        const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
        const grid = new GridLayer(root);
        root.addLayer(grid.renderRoot);
        const [spaceRoom, adminRoom] = await Promise.all([getGlobalRoom('space'), getGlobalRoom('admin')]);
        const fragCounter = new FragCounter(adminRoom.state);
        const selectionContainer = new SelectionContainer(spaceRoom.state);
        const selection = new InteractiveLayer(root, spaceRoom, selectionContainer);
        const blipLayer = new ObjectsLayer(root, spaceRoom, blipRenderer, selectionContainer);
        root.addLayer(blipLayer.renderRoot);
        root.addLayer(selection.renderRoot);
        root.addLayer(fragCounter);
    }

    PIXI.Loader.shared.load(() => {
        void init();
    });
}

export const gmWidget: DashboardWidget<{ zoom: number }> = {
    name: 'GM',
    type: 'component',
    component: gmComponent,
    defaultProps: { zoom: 1 },
    makeHeaders: makeRadarHeaders,
};
