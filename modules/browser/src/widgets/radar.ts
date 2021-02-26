import * as PIXI from 'pixi.js';

import { GameRoom, SpaceObject } from '@starwards/model';

import $ from 'jquery';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { GridLayer } from '../radar/grid-layer';
import { ObjectsLayer } from '../radar/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import WebFont from 'webfontloader';
import { blipRenderer } from '../radar/blip-renderer';
import { getGlobalRoom } from '../client';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

class RadarComponent {
    constructor(container: Container, state: Props) {
        const camera = new Camera();
        camera.bindZoom(container, state);
        container.getElement().bind('wheel', (e) => {
            e.stopPropagation();
            e.preventDefault();
            camera.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
        });
        async function init() {
            const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
            const grid = new GridLayer(root);
            root.addLayer(grid.renderRoot);
            const room = await getGlobalRoom('space');
            const blipLayer = new ObjectsLayer(root, room, blipRenderer, new SelectionContainer().init(room.state));
            root.addLayer(blipLayer.renderRoot);
            trackObject(camera, room, state.subjectId);
        }
        PIXI.Loader.shared.load(() => {
            void init();
        });
    }
}

function trackObject(camera: Camera, room: GameRoom<'space'>, subjectId: string) {
    let tracked = room.state.get(subjectId);
    if (tracked) {
        camera.followSpaceObject(tracked, room.state.events);
    } else {
        room.state.events.on('add', (spaceObject: SpaceObject) => {
            if (!tracked && spaceObject.id === subjectId) {
                tracked = spaceObject;
                camera.followSpaceObject(tracked, room.state.events);
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
export type Props = { zoom: number; subjectId: string };
export const radarWidget: DashboardWidget<Props> = {
    name: 'radar',
    type: 'component',
    component: RadarComponent,
    defaultProps: { zoom: 1 },
    makeHeaders: makeRadarHeaders,
};
