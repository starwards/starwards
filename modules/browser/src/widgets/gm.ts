import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { Driver } from '../driver';
import { FragCounter } from './frag';
import { GridLayer } from '../radar/grid-layer';
import { InteractiveLayer } from '../radar/interactive-layer';
import { Loader } from 'pixi.js';
import { ObjectsLayer } from '../radar/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import { blipRenderer } from '../radar/blip-renderer';
import { makeRadarHeaders } from './radar';

export interface RadarState {
    zoom: number;
}
export class GmWidgets {
    public radar: DashboardWidget<RadarState>;
    public selectionContainer: SelectionContainer;
    constructor(driver: Driver) {
        const selectionContainer = new SelectionContainer();
        this.selectionContainer = selectionContainer;
        class GmRadarComponent {
            constructor(container: Container, state: RadarState) {
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
                const pixiLoaded = new Promise((res) => Loader.shared.load(res));
                const [spaceDriver, adminDriver] = await Promise.all([
                    driver.getSpaceDriver(),
                    driver.getAdminDriver(),
                    pixiLoaded,
                ]);
                const fragCounter = new FragCounter(adminDriver.state);
                const selection = new InteractiveLayer(root, spaceDriver, selectionContainer);
                const blipLayer = new ObjectsLayer(root, spaceDriver.state, blipRenderer, selectionContainer);
                root.addLayer(blipLayer.renderRoot);
                root.addLayer(selection.renderRoot);
                root.addLayer(fragCounter);
            }
        }
        // todo make lazy
        this.radar = {
            name: 'GM Radar',
            type: 'component',
            defaultProps: { zoom: 1 },
            makeHeaders: makeRadarHeaders,
            component: GmRadarComponent,
        };
        void driver.getSpaceDriver().then((spaceDriver) => selectionContainer.init(spaceDriver.state));
    }
}
