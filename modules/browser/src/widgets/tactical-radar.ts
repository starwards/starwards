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

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

function tacticalRadarComponent(container: Container, state: Props) {
    const camera = new Camera();
    camera.bindRange(container, sizeFactor - sizeFactorGrace, state);

    PIXI.Loader.shared.load(async () => {
        const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
        root.setSquare();
        const range = new RangeIndicators(root, 1000);
        range.setSizeFactor(sizeFactor);
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
        camera.followSpaceObject(tracked, room.state.events, true);
    } else {
        room.state.events.on('add', (spaceObject: SpaceObject) => {
            if (!tracked && spaceObject.id === subjectId) {
                tracked = spaceObject;
                camera.followSpaceObject(tracked, room.state.events, true);
            }
        });
    }
}

export type Props = { range: number; subjectId: string };
export const tacticalRadarWidget: DashboardWidget<Props> = {
    name: 'tactical radar',
    type: 'component',
    component: tacticalRadarComponent,
    defaultProps: { range: 5000 },
};
