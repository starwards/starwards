import * as PIXI from 'pixi.js';

import { ShipDriver, SpaceDriver } from '../driver';

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
    constructor(container: Container, p: Props) {
        const camera = new Camera();
        camera.bindRange(container, sizeFactor - sizeFactorGrace, p);

        PIXI.Loader.shared.load(() => {
            const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
            root.setSquare();
            const range = new RangeIndicators(root, p.range / 5);
            range.setSizeFactor(sizeFactor);
            root.addLayer(range.renderRoot);
            const shipTarget = trackTargetObject(p.spaceDriver.state, p.shipDriver.state);
            root.addLayer(crosshairs(root, p.shipDriver.state, shipTarget));
            const blipLayer = new ObjectsLayer(root, p.spaceDriver.state, blipRenderer, shipTarget);
            root.addLayer(blipLayer.renderRoot);
            trackObject(camera, p.spaceDriver.state, shipTarget);
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

export type Props = { range: number; spaceDriver: SpaceDriver; shipDriver: ShipDriver };
export const targetRadarWidget: DashboardWidget<Props> = {
    name: 'target radar',
    type: 'component',
    component: TargetRadarComponent,
    defaultProps: { range: 1000 },
};
