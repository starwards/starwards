import * as PIXI from 'pixi.js';

import { SpaceObject, State } from '@starwards/model';

import $ from 'jquery';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { GridLayer } from '../radar/grid-layer';
import { ObjectsLayer } from '../radar/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import { SpaceDriver } from '../driver';
import WebFont from 'webfontloader';
import { blipRenderer } from '../radar/blip-renderer';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

class RadarComponent {
    constructor(container: Container, p: Props) {
        const camera = new Camera();
        camera.bindZoom(container, p);
        container.getElement().bind('wheel', (e) => {
            e.stopPropagation();
            e.preventDefault();
            camera.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
        });
        PIXI.Loader.shared.load(() => {
            const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
            const grid = new GridLayer(root);
            root.addLayer(grid.renderRoot);
            const blipLayer = new ObjectsLayer(
                root,
                p.spaceDriver.state,
                blipRenderer,
                new SelectionContainer().init(p.spaceDriver.state)
            );
            root.addLayer(blipLayer.renderRoot);
            trackObject(camera, p.spaceDriver.state, p.subjectId);
        });
    }
}

function trackObject(camera: Camera, spaceState: State<'space'>, subjectId: string) {
    let tracked = spaceState.get(subjectId);
    if (tracked) {
        camera.followSpaceObject(tracked, spaceState.events);
    } else {
        spaceState.events.on('add', (spaceObject: SpaceObject) => {
            if (!tracked && spaceObject.id === subjectId) {
                tracked = spaceObject;
                camera.followSpaceObject(tracked, spaceState.events);
            }
        });
    }
}

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
export type Props = { zoom: number; subjectId: string; spaceDriver: SpaceDriver };
export const radarWidget: DashboardWidget<Props> = {
    name: 'radar',
    type: 'component',
    component: RadarComponent,
    defaultProps: { zoom: 1 },
    makeHeaders: makeRadarHeaders,
};
