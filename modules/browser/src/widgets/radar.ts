import { Faction, SpaceObject } from '@starwards/model';
import { ShipDriver, SpaceDriver } from '../driver';
import { blue, red, yellow } from '../colors';

import $ from 'jquery';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { GridLayer } from '../radar/grid-layer';
import { Loader } from 'pixi.js';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import WebFont from 'webfontloader';
import { dradisDrawFunctions } from '../radar/blips/blip-renderer';

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
                .waitForObjecr(shipDriver.id)
                .then((tracked) => camera.followSpaceObject(tracked, spaceDriver.state.events));
            Loader.shared.load(() => {
                const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
                const grid = new GridLayer(root);
                root.addLayer(grid.renderRoot);
                const blipLayer = new ObjectsLayer(
                    root,
                    spaceDriver.state,
                    64,
                    (s: SpaceObject) => {
                        if (s.faction === Faction.none) return yellow;
                        if (s.faction === shipDriver.faction.getValue()) return blue;
                        return red;
                    },
                    dradisDrawFunctions,
                    new SelectionContainer().init(spaceDriver.state)
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
