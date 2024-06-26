import { Destructors, Driver, Faction, Projectile, SpaceObject, TypeFilter } from '@starwards/core';
import { Graphics, UPDATE_PRIORITY, filters } from 'pixi.js';
import { blue, radarVisibleBg, red, white, yellow } from '../colors';
import { tacticalDrawFunctions, tacticalDrawWaypoints } from '../radar/blips/blip-renderer';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { GridLayer } from '../radar/grid-layer';
import { InteractiveLayer } from '../radar/interactive-layer';
import { InteractiveLayerCommands } from '../radar/interactive-layer-commands';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { Pane } from 'tweakpane';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { SelectionContainer } from '../radar/selection-container';
import { addEnumListBlade } from '../panel';
import { createWidget } from './create';
import { makeRadarHeaders } from './radar';
import { propertyStub } from '../property-wrappers';
import { tweakWidget } from './tweak';

interface RadarState {
    zoom: number;
}

export class GmWidgets {
    public radar: DashboardWidget<RadarState>;
    public tweak: DashboardWidget;
    public create: DashboardWidget;
    private viewFilter = propertyStub(TypeFilter.ALL);
    public selectionContainer = new SelectionContainer(this.viewFilter);
    public interactiveLayerCommands = new InteractiveLayerCommands();
    constructor(driver: Driver) {
        this.tweak = tweakWidget(driver, this.selectionContainer);
        this.create = createWidget(this.interactiveLayerCommands);
        void driver.getSpaceDriver().then((spaceDriver) => this.selectionContainer.init(spaceDriver));
        const { selectionContainer, interactiveLayerCommands, viewFilter } = this;
        class GmRadarComponent {
            constructor(container: Container, state: RadarState) {
                const pane = new Pane({ container: container.getElement().get(0) });
                const panelCleanup = new Destructors();
                panelCleanup.add(() => {
                    pane.dispose();
                });
                container.on('destroy', panelCleanup.destroy);
                addEnumListBlade(pane, viewFilter, 'type', TypeFilter, panelCleanup.add);

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
                const [spaceDriver] = await Promise.all([driver.getSpaceDriver()]);
                // const fps = new FpsCounter(root);
                const interactiveLayer = new InteractiveLayer(
                    root,
                    spaceDriver,
                    selectionContainer,
                    interactiveLayerCommands,
                );
                const getFactionColor = (faction: Faction) => {
                    switch (faction) {
                        case Faction.NONE:
                        case Faction.FACTION_COUNT:
                            return yellow;
                        case Faction.Gravitas:
                            return red;
                        case Faction.Raiders:
                            return blue;
                    }
                };
                const getColor = (s: SpaceObject) => (Projectile.isInstance(s) ? white : getFactionColor(s.faction));
                const blipLayer = new ObjectsLayer(
                    root,
                    spaceDriver,
                    64,
                    getColor,
                    tacticalDrawFunctions,
                    selectionContainer,
                    () => viewFilter.getValue() !== TypeFilter.WAYPOINTS,
                );
                const rangeFilter = new RadarRangeFilter(spaceDriver);
                root.ticker.add(rangeFilter.update, null, UPDATE_PRIORITY.LOW);
                for (let faction = 0; faction < (Faction.FACTION_COUNT as number); faction++) {
                    const fovGraphics = new Graphics();
                    fovGraphics.filters = [new filters.AlphaFilter(0.1)];
                    root.addLayer(fovGraphics);

                    root.ticker.add(
                        () => {
                            fovGraphics.clear();
                            fovGraphics.lineStyle(0);
                            for (const fov of rangeFilter.fieldsOfView()) {
                                if ((fov.object.faction as number) === faction) {
                                    fovGraphics.beginFill(getFactionColor(faction), 1);
                                    fov.draw(root, fovGraphics);
                                    fovGraphics.endFill();
                                }
                            }
                        },
                        null,
                        UPDATE_PRIORITY.LOW,
                    );
                }
                root.addLayer(blipLayer.renderRoot);

                const waypointsLayer = new ObjectsLayer(
                    root,
                    spaceDriver,
                    32,
                    (w) => w.color,
                    tacticalDrawWaypoints,
                    selectionContainer,
                    () => viewFilter.getValue() !== TypeFilter.OBJECTS,
                );
                root.addLayer(waypointsLayer.renderRoot);
                root.addLayer(interactiveLayer.renderRoot);
            }
        }
        this.radar = {
            name: 'GM Radar',
            type: 'component',
            defaultProps: { zoom: 1 },
            makeHeaders: makeRadarHeaders,
            component: GmRadarComponent,
        };
    }
}
