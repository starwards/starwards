import { GridLayer } from '../radar/grid-layer';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { Container } from 'golden-layout';
import { getRoom, NamedGameRoom } from '../client';
import { preloadList } from '../radar/blip-renderer';
import $ from 'jquery';
import { DashboardWidget } from './dashboard';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { BlipsLayer } from '../radar/blips-layer';
import { SelectionContainer } from '../radar/selection-container';
import { Spaceship, SpaceObject } from '@starwards/model';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

PIXI.Loader.shared.add(preloadList);

function radarComponent(container: Container, state: { zoom: number }) {
    const camera = new Camera();
    camera.bindZoom(container, state);
    PIXI.Loader.shared.load(async () => {
        const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
        const grid = new GridLayer(root);
        root.addLayer(grid.renderRoot);
        const room = await getRoom('space');
        const blipper = new BlipsLayer(root, room, new SelectionContainer(room));
        root.addLayer(blipper.renderRoot);
        trackFirstSpaceship(camera, room);
    });
}

// hacky just for show
function trackFirstSpaceship(camera: Camera, room: NamedGameRoom<'space'>) {
    let tracked: Spaceship | null = null;
    for (const spaceObject of room.state) {
        if (Spaceship.isInstance(spaceObject)) {
            tracked = spaceObject;
            break;
        }
    }
    if (tracked) {
        camera.followSpaceObject(tracked, room.state.events);
    } else {
        room.state.events.on('add', (spaceObject: SpaceObject) => {
            if (!tracked && Spaceship.isInstance(spaceObject)) {
                tracked = spaceObject;
                camera.followSpaceObject(tracked, room.state.events);
            }
        });
    }
}

export function makeRadarHeaders(container: Container): Array<JQuery<HTMLElement>> {
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

export const radarWidget: DashboardWidget<{ zoom: number }> = {
    name: 'radar',
    type: 'component',
    component: radarComponent,
    initialState: { zoom: 1 },
    makeHeaders: makeRadarHeaders,
};
