import { GridLayer } from '../radar/grid-layer';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { Container } from 'golden-layout';
import { getGlobalRoom, NamedGameRoom } from '../client';
import { blipRenderer } from '../radar/blip-renderer';
import { DashboardWidget } from './dashboard';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { ObjectsLayer } from '../radar/objects-layer';
import { SelectionContainer } from '../radar/selection-container';
import { SpaceObject } from '@starwards/model';
import { RangeIndicators } from '../radar/range-indicators';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

function tacticalRadarComponent(container: Container, state: Props) {
    const camera = new Camera();
    camera.bindZoom(container, state);

    PIXI.Loader.shared.load(async () => {
        const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
        const grid = new GridLayer(root);
        root.addLayer(grid.renderRoot);
        const range = new RangeIndicators(root, 1000);
        root.addLayer(range.renderRoot);
        // container.getElement().bind('wheel', (e) => {
        //     e.stopPropagation();
        //     e.preventDefault();
        //     range.changeStepSize(-(e.originalEvent as WheelEvent).deltaY);
        // });
        const room = await getGlobalRoom('space');
        const blipLayer = new ObjectsLayer(root, room, blipRenderer, new SelectionContainer(room));
        root.addLayer(blipLayer.renderRoot);
        // const velocityLayer = new ObjectsLayer(root, room, velocityRenderer, new SelectionContainer(room));
        // root.addLayer(velocityLayer.renderRoot);
        trackObject(camera, room, state.subjectId);
    });
}

function trackObject(camera: Camera, room: NamedGameRoom<'space'>, subjectId: string) {
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

export type Props = { zoom: number; subjectId: string };
export const tacticalRadarWidget: DashboardWidget<Props> = {
    name: 'tactical radar',
    type: 'component',
    component: tacticalRadarComponent,
    defaultProps: { zoom: 1 / 15 },
};
