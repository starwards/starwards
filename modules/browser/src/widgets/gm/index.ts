import * as PIXI from 'pixi.js';

import { Camera } from '../../radar/camera';
import { CameraView } from '../../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from '../dashboard';
import { FragCounter } from '../frag';
import { GridLayer } from '../../radar/grid-layer';
import { InteractiveLayer } from '../../radar/interactive-layer';
import { ObjectsLayer } from '../../radar/objects-layer';
import { SelectionContainer } from '../../radar/selection-container';
import { blipRenderer } from '../../radar/blip-renderer';
import { getGlobalRoom } from '../../client';
import { makeRadarHeaders } from '../radar';

export class GmWidgets {
    public selectionContainer = new SelectionContainer();
    public radar = getGmRadarComponent(this.selectionContainer);
    constructor() {
        // todo make lazy
        void getGlobalRoom('space').then((spaceRoom) => this.selectionContainer.init(spaceRoom.state));
    }
}

interface State {
    zoom: number;
}
function getGmRadarComponent(selectionContainer: SelectionContainer): DashboardWidget<State> {
    class GmRadarComponent {
        constructor(container: Container, state: State) {
            const camera = new Camera();
            camera.bindZoom(container, state);
            container.getElement().bind('wheel', (e) => {
                e.stopPropagation();
                e.preventDefault();
                camera.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
            });
            const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
            const grid = new GridLayer(root);
            root.addLayer(grid.renderRoot);
            void this.init(root);
        }

        // the async part of initializing
        private async init(root: CameraView) {
            const pixiLoaded = new Promise((res) => PIXI.Loader.shared.load(res));
            const [spaceRoom, adminRoom] = await Promise.all([
                getGlobalRoom('space'),
                getGlobalRoom('admin'),
                pixiLoaded,
            ]);
            const fragCounter = new FragCounter(adminRoom.state);
            const selection = new InteractiveLayer(root, spaceRoom, selectionContainer);
            const blipLayer = new ObjectsLayer(root, spaceRoom, blipRenderer, selectionContainer);
            root.addLayer(blipLayer.renderRoot);
            root.addLayer(selection.renderRoot);
            root.addLayer(fragCounter);
        }
    }
    return {
        name: 'GM Radar',
        type: 'component',
        defaultProps: { zoom: 1 },
        makeHeaders: makeRadarHeaders,
        component: GmRadarComponent,
    };
}
