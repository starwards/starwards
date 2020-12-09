import { degToRad, SpaceObject } from '@starwards/model';
import { Container } from 'golden-layout';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { getGlobalRoom, getShipRoom, NamedGameRoom } from '../client';
import { blipRenderer } from '../radar/blip-renderer';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { MovementAnchorLayer } from '../radar/movement-anchor-layer';
import { ObjectsLayer } from '../radar/objects-layer';
import { RangeIndicators } from '../radar/range-indicators';
import { SpriteLayer } from '../radar/sprite-layer';
import { crosshairs, speedLines } from '../radar/tactical-radar-layers';
import { trackTargetObject } from '../ship-logic';
import { DashboardWidget } from './dashboard';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

export const preloadList = ['images/crosshair1.png', 'images/asimuth-circle.svg'];

PIXI.Loader.shared.add(preloadList);

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

function tacticalRadarComponent(container: Container, state: Props) {
    const camera = new Camera();
    camera.bindRange(container, sizeFactor - sizeFactorGrace, state);
    async function init() {
        const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
        root.setSquare();
        const [spaceRoom, shipRoom] = await Promise.all([getGlobalRoom('space'), getShipRoom(state.subjectId)]);
        const background = new MovementAnchorLayer(
            root,
            {
                width: 2,
                color: 0xaaffaa,
                alpha: 0.1,
            },
            1000,
            state.range
        );
        root.addLayer(background.renderRoot);
        const range = new RangeIndicators(root, state.range / 5);
        range.setSizeFactor(sizeFactor);
        root.addLayer(range.renderRoot);
        const asimuthCircle = new SpriteLayer(
            root,
            {
                fileName: 'images/asimuth-circle.svg',
                tint: 0xaaffaa,
                radiusMeters: 6000,
            },
            () => shipRoom.state.position,
            () => degToRad * -shipRoom.state.angle
        );
        root.addLayer(asimuthCircle.renderRoot);
        const shipTarget = trackTargetObject(spaceRoom.state, shipRoom.state);
        root.addLayer(crosshairs(root, shipRoom.state, shipTarget));
        root.addLayer(speedLines(root, shipRoom.state, shipTarget));
        const blipLayer = new ObjectsLayer(root, spaceRoom, blipRenderer, shipTarget);
        root.addLayer(blipLayer.renderRoot);
        trackObject(camera, spaceRoom, state.subjectId);
    }

    PIXI.Loader.shared.load(() => {
        void init();
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
