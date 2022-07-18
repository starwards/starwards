import { CannonShell, Faction, SpaceObject } from '@starwards/model';
import { Graphics, Loader, UPDATE_PRIORITY, filters } from 'pixi.js';
import { blue, radarVisibleBg, red, white, yellow } from '../colors';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { Driver } from '../driver';
import { FragCounter } from './frag';
import { GridLayer } from '../radar/grid-layer';
import { InteractiveLayer } from '../radar/interactive-layer';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { SelectionContainer } from '../radar/selection-container';
import { makeRadarHeaders } from './radar';
import { tacticalDrawFunctions } from '../radar/blips/blip-renderer';
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
                const root = new CameraView({ backgroundColor: radarVisibleBg }, camera, container);
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
                const getFactionColor = (faction: Faction) => {
                    switch (faction) {
                        case Faction.none:
                        case Faction.factionCount:
                            return yellow;
                        case Faction.Gravitas:
                            return red;
                        case Faction.Raiders:
                            return blue;
                    }
                };
                const getColor = (s: SpaceObject) => (CannonShell.isInstance(s) ? white : getFactionColor(s.faction));
                const blipLayer = new ObjectsLayer(
                    root,
                    spaceDriver,
                    64,
                    getColor,
                    tacticalDrawFunctions,
                    selectionContainer
                );
                const rangeFilter = new RadarRangeFilter(spaceDriver);
                root.ticker.add(rangeFilter.update, null, UPDATE_PRIORITY.LOW);
                for (let faction = 0; faction < Faction.factionCount; faction++) {
                    const fovGraphics = new Graphics();
                    fovGraphics.filters = [new filters.AlphaFilter(0.1)];
                    root.addLayer(fovGraphics);

                    root.ticker.add(
                        () => {
                            fovGraphics.clear();
                            fovGraphics.lineStyle(0);
                            for (const fov of rangeFilter.fieldsOfView()) {
                                if (fov.object.faction === faction) {
                                    fovGraphics.beginFill(getFactionColor(faction), 1);
                                    fov.draw(root, fovGraphics);
                                    fovGraphics.endFill();
                                }
                            }
                        },
                        null,
                        UPDATE_PRIORITY.LOW
                    );
                }
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
        void driver.getSpaceDriver().then((spaceDriver) => selectionContainer.init(spaceDriver));
    }
}
