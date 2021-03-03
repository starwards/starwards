import * as PIXI from 'pixi.js';

import { SpaceDriver, getShipDriver, getSpaceDriver } from '../driver';
import { SpaceObject, degToRad } from '@starwards/model';
import { crosshairs, speedLines } from '../radar/tactical-radar-layers';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { MovementAnchorLayer } from '../radar/movement-anchor-layer';
import { ObjectsLayer } from '../radar/objects-layer';
import { RangeIndicators } from '../radar/range-indicators';
import { SpriteLayer } from '../radar/sprite-layer';
import WebFont from 'webfontloader';
import { blipRenderer } from '../radar/blip-renderer';
import { trackTargetObject } from '../ship-logic';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

export const preloadList = ['images/crosshair1.png', 'images/asimuth-circle.svg'];

PIXI.Loader.shared.add(preloadList);

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

class TacticalRadarComponent {
    constructor(container: Container, state: Props) {
        const camera = new Camera();
        camera.bindRange(container, sizeFactor - sizeFactorGrace, state);
        async function init() {
            const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
            root.setSquare();
            const [spaceDriver, shipDriver] = await Promise.all([getSpaceDriver(), getShipDriver(state.subjectId)]);
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
                () => shipDriver.state.position,
                () => degToRad * -shipDriver.state.angle
            );
            root.addLayer(asimuthCircle.renderRoot);
            const shipTarget = trackTargetObject(spaceDriver.state, shipDriver.state);
            root.addLayer(crosshairs(root, shipDriver.state, shipTarget));
            root.addLayer(speedLines(root, shipDriver.state, shipTarget));
            const blipLayer = new ObjectsLayer(root, spaceDriver.state, blipRenderer, shipTarget);
            root.addLayer(blipLayer.renderRoot);
            trackObject(camera, spaceDriver, state.subjectId);
        }

        PIXI.Loader.shared.load(() => {
            void init();
        });
    }
}

function trackObject(camera: Camera, spaceDriver: SpaceDriver, subjectId: string) {
    let tracked = spaceDriver.state.get(subjectId);
    if (tracked) {
        camera.followSpaceObject(tracked, spaceDriver.state.events, true);
    } else {
        spaceDriver.state.events.on('add', (spaceObject: SpaceObject) => {
            if (!tracked && spaceObject.id === subjectId) {
                tracked = spaceObject;
                camera.followSpaceObject(tracked, spaceDriver.state.events, true);
            }
        });
    }
}

export type Props = { range: number; subjectId: string };
export const tacticalRadarWidget: DashboardWidget<Props> = {
    name: 'tactical radar',
    type: 'component',
    component: TacticalRadarComponent,
    defaultProps: { range: 5000 },
};
