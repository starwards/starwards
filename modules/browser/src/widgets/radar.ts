import { Faction, ShipDriver, SpaceDriver, SpaceObject } from '@starwards/model';
import { Loader, UPDATE_PRIORITY } from 'pixi.js';
import { blue, radarFogOfWar, radarVisibleBg, red, yellow } from '../colors';
import { dradisDrawFunctions, rangeRangeDrawFunctions } from '../radar/blips/blip-renderer';

import $ from 'jquery';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { GridLayer } from '../radar/grid-layer';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { SelectionContainer } from '../radar/selection-container';
import WebFont from 'webfontloader';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

export function makeRadarHeaders(container: Container, _: unknown): Array<JQuery<HTMLElement>> {
    const zoomIn = $('<i data-id="zoom_in" class="lm_controls tiny material-icons">zoom_in</i>');
    const zoomOut = $('<i data-id="zoom_out" class="lm_controls tiny material-icons">zoom_out</i>');
    zoomIn.mousedown(() => {
        const zoomInterval = setInterval(() => {
            container.emit('zoomIn');
        }, 100);
        $(document).mouseup(() => clearInterval(zoomInterval));
    });
    zoomOut.mousedown(() => {
        const zoomInterval = setInterval(() => {
            container.emit('zoomOut');
        }, 100);
        $(document).mouseup(() => clearInterval(zoomInterval));
    });
    return [zoomIn, zoomOut];
}

export type Props = { zoom: number };
export function radarWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver): DashboardWidget<Props> {
    class RadarComponent {
        constructor(container: Container, p: Props) {
            const camera = new Camera();
            camera.bindZoom(container, p);
            container.getElement().bind('wheel', (e) => {
                e.stopPropagation();
                e.preventDefault();
                camera.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
            });
            void spaceDriver
                .waitForObject(shipDriver.id)
                .then((tracked) => camera.followSpaceObject(tracked, spaceDriver.events));
            Loader.shared.load(() => {
                const root = new CameraView({ backgroundColor: radarFogOfWar }, camera, container);
                const radarRangeLayer = new ObjectsLayer(
                    root,
                    spaceDriver,
                    64,
                    () => radarVisibleBg,
                    rangeRangeDrawFunctions,
                    undefined,
                    (s: SpaceObject) => s.faction === shipDriver.faction.getValue()
                );
                root.addLayer(radarRangeLayer.renderRoot);
                const grid = new GridLayer(root);
                root.addLayer(grid.renderRoot);
                const rangeFilter = new RadarRangeFilter(
                    spaceDriver,
                    (o: SpaceObject) => o.faction === shipDriver.faction.getValue()
                );
                root.ticker.add(rangeFilter.update, null, UPDATE_PRIORITY.UTILITY);
                const blipLayer = new ObjectsLayer(
                    root,
                    spaceDriver,
                    64,
                    (s: SpaceObject) => {
                        if (s.faction === Faction.none) return yellow;
                        if (s.faction === shipDriver.faction.getValue()) return blue;
                        return red;
                    },
                    dradisDrawFunctions,
                    new SelectionContainer().init(spaceDriver),
                    rangeFilter.isInRange
                );
                root.addLayer(blipLayer.renderRoot);
            });
        }
    }

    return {
        name: 'radar',
        type: 'component',
        component: RadarComponent,
        defaultProps: { zoom: 1 },
        makeHeaders: makeRadarHeaders,
    };
}
