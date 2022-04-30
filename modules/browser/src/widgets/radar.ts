import { Faction, SpaceObject } from '@starwards/model';
import { Filter, Loader, utils } from 'pixi.js';
import { ShipDriver, SpaceDriver } from '../driver';
import { blue, red, white, yellow } from '../colors';
import { dradisDrawFunctions, rangeRangeDrawFunctions } from '../radar/blips/blip-renderer';

import $ from 'jquery';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { GridLayer } from '../radar/grid-layer';
import { ObjectsLayer } from '../radar/blips/objects-layer';
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
                const radarRangeLayer = new ObjectsLayer(
                    root,
                    spaceDriver.state,
                    64,
                    () => white,
                    rangeRangeDrawFunctions,
                    undefined,
                    (s: SpaceObject) => s.faction === shipDriver.faction.getValue()
                );
                const vertex =
                    'attribute vec2 aVertexPosition;\nattribute vec2 aTextureCoord;\n\nuniform mat3 projectionMatrix;\n\nvarying vec2 vTextureCoord;\n\nvoid main(void)\n{\n    gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);\n    vTextureCoord = aTextureCoord;\n}';

                const fragmentSrc = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform vec2 thickness;
uniform vec4 outlineColor;
uniform vec4 filterClamp;

const float DOUBLE_PI = 3.14159265358979323846264 * 2.;

void main(void) {
    vec4 ownColor = texture2D(uSampler, vTextureCoord);
    vec4 curColor;
    float maxAlpha = 0.;
    vec2 displaced;
    for (float angle = 0.; angle <= DOUBLE_PI; angle += 0.1) {
        displaced.x = vTextureCoord.x + thickness.x * cos(angle);
        displaced.y = vTextureCoord.y + thickness.y * sin(angle);
        curColor = texture2D(uSampler, clamp(displaced, filterClamp.xy, filterClamp.zw));
        maxAlpha = max(maxAlpha, curColor.a);
    }
    float resultAlpha = maxAlpha * step(ownColor.a, 0.0) > 0. ? 1. : 0.0;

    gl_FragColor = vec4(outlineColor.rgb * resultAlpha, resultAlpha);
}`;
                const _thickness = 2;
                const uniforms = {
                    thickness: new Float32Array([0, 0]),
                    outlineColor: utils.hex2rgb(white, new Float32Array([0, 0, 0, 1])),
                };
                const myFilter = new Filter(vertex, fragmentSrc, uniforms);
                myFilter.apply = function (filterManager, input, output, clear) {
                    uniforms.thickness[0] = _thickness / input._frame.width;
                    uniforms.thickness[1] = _thickness / input._frame.height;
                    filterManager.applyFilter(this, input, output, clear);
                };
                radarRangeLayer.renderRoot.filters = [myFilter]; //new OutlineFilter(2, red), new filters.AlphaFilter(0)];
                root.addLayer(radarRangeLayer.renderRoot);
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
