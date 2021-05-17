import { ShipDriver, SpaceDriver } from '../driver';
import { blue, red, yellow } from '../colors';

import $ from 'jquery';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { Faction } from '@starwards/model';
import { GridLayer } from '../radar/grid-layer';
import { Loader } from 'pixi.js';
import { ObjectsLayer } from '../radar/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import WebFont from 'webfontloader';
import { blipRenderer } from '../radar/blip-renderer';
import { dradisDrawFunctions } from '../radar/dradis-blip-renderer';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

export function makeRadarHeaders(container: Container, _: unknown): Array<JQuery<HTMLElement>> {
    const zoomIn = $('<i class="lm_controls tiny material-icons">zoom_in</i>');
    const zoomOut = $('<i class="lm_controls tiny material-icons">zoom_out</i>');
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
                    blipRenderer(
                        dradisDrawFunctions({
                            blipSize: () => 64,
                            factionsColor: (f: Faction) => {
                                if (f === Faction.none) return yellow;
                                if (f === shipDriver.faction.getValue()) return blue;
                                return red;
                            },
                        })
                    ),
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
