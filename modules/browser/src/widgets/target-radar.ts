import { SpaceState } from '@starwards/model';
import { Container } from 'golden-layout';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { getGlobalRoom, getShipRoom } from '../client';
import { blipRenderer } from '../radar/blip-renderer';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { ObjectsLayer } from '../radar/objects-layer';
import { RangeIndicators } from '../radar/range-indicators';
import { SelectionContainer } from '../radar/selection-container';
import { crosshairs } from '../radar/tactical-radar-layers';
import { trackTargetObject } from '../ship-logic';
import { DashboardWidget } from './dashboard';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

function targetRadarComponent(container: Container, state: Props) {
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
    component: targetRadarComponent,
    defaultProps: { range: 1000 },
};
