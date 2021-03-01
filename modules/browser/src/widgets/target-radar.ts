import * as PIXI from 'pixi.js';

import { getGlobalRoom, getShipRoom } from '../client';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { ObjectsLayer } from '../radar/objects-layer';
import { RangeIndicators } from '../radar/range-indicators';
import { SelectionContainer } from '../radar/selection-container';
import { SpaceState } from '@starwards/model';
import WebFont from 'webfontloader';
import { blipRenderer } from '../radar/blip-renderer';
import { crosshairs } from '../radar/tactical-radar-layers';
import { trackTargetObject } from '../ship-logic';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

class TargetRadarComponent {
    constructor(container: Container, state: Props) {
        const camera = new Camera();
        camera.bindRange(container, sizeFactor - sizeFactorGrace, state);

        async function init() {
            const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
            root.setSquare();
            const range = new RangeIndicators(root, state.range / 5);
            range.setSizeFactor(sizeFactor);
            root.addLayer(range.renderRoot);
            const [spaceRoom, shipRoom] = await Promise.all([getGlobalRoom('space'), getShipRoom(state.subjectId)]);
            const shipTarget = trackTargetObject(spaceRoom.state, shipRoom.state);
            root.addLayer(crosshairs(root, shipRoom.state, shipTarget));
            const blipLayer = new ObjectsLayer(root, spaceRoom, blipRenderer, shipTarget);
            root.addLayer(blipLayer.renderRoot);
            trackObject(camera, spaceRoom.state, shipTarget);
        }

        PIXI.Loader.shared.load(() => {
            void init();
        });
    }
}

function trackObject(camera: Camera, space: SpaceState, target: SelectionContainer) {
    let unfollow = (): void => undefined;
    target.events.on('changed', () => {
        unfollow();
        const tracked = target.getSingle();
        if (tracked) {
            unfollow = camera.followSpaceObject(tracked, space.events);
        }
    });
}

export type Props = { range: number; subjectId: string };
export const targetRadarWidget: DashboardWidget<Props> = {
    name: 'target radar',
    type: 'component',
    component: TargetRadarComponent,
    defaultProps: { range: 1000 },
};
