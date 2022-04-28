import { Faction, SpaceObject } from '@starwards/model';
import { blue, red, yellow } from '../colors';
import { rangeRangeDrawFunctions, tacticalDrawFunctions } from '../radar/blips/blip-renderer';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { Driver } from '../driver';
import { FragCounter } from './frag';
import { GridLayer } from '../radar/grid-layer';
import { InteractiveLayer } from '../radar/interactive-layer';
import { Loader } from 'pixi.js';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import { makeRadarHeaders } from './radar';
import { tweakWidget } from './tweak';

export interface RadarState {
    zoom: number;
}
export class GmWidgets {
    public radar: DashboardWidget<RadarState>;
    public tweak: DashboardWidget;
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
                root.view.setAttribute('data-id', 'GM Radar');
                root.view.setAttribute('data-zoom', `${camera.zoom}`);
                root.events.on('screenChanged', () => root.view.setAttribute('data-zoom', `${camera.zoom}`));
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
                // const fps = new FpsCounter(root);
                const selection = new InteractiveLayer(root, spaceDriver, selectionContainer);
                const getColor = (s: SpaceObject) => {
                    switch (s.faction) {
                        case Faction.none:
                            return yellow;
                        case Faction.Gravitas:
                            return red;
                        case Faction.Raiders:
                            return blue;
                    }
                };
                const blipLayer = new ObjectsLayer(
                    root,
                    spaceDriver.state,
                    64,
                    getColor,
                    tacticalDrawFunctions,
                    selectionContainer
                );
                const radarRangeLayer = new ObjectsLayer(
                    root,
                    spaceDriver.state,
                    64,
                    getColor,
                    rangeRangeDrawFunctions
                );
                root.addLayer(radarRangeLayer.renderRoot);
                root.addLayer(blipLayer.renderRoot);
                root.addLayer(selection.renderRoot);
                // root.addLayer(fps.renderRoot);
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
        this.tweak = tweakWidget(driver, selectionContainer);
        void driver.getSpaceDriver().then((spaceDriver) => selectionContainer.init(spaceDriver.state));
    }
}
