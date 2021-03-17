import { ShipDriver, SpaceDriver } from '../driver';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { Loader } from 'pixi.js';
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

export type Props = { range: number };
export function targetRadarWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver): DashboardWidget<Props> {
    class TargetRadarComponent {
        constructor(container: Container, p: Props) {
            const camera = new Camera();
            camera.bindRange(container, sizeFactor - sizeFactorGrace, p);

            Loader.shared.load(() => {
                const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
                root.setSquare();
                const range = new RangeIndicators(root, p.range / 5);
                range.setSizeFactor(sizeFactor);
                root.addLayer(range.renderRoot);
                const shipTarget = trackTargetObject(spaceDriver.state, shipDriver);
                root.addLayer(crosshairs(root, shipDriver.state, shipTarget));
                const blipLayer = new ObjectsLayer(root, spaceDriver.state, blipRenderer, shipTarget);
                root.addLayer(blipLayer.renderRoot);
                trackObject(camera, spaceDriver.state, shipTarget);
            });
        }
    }
    return {
        name: 'target radar',
        type: 'component',
        component: TargetRadarComponent,
        defaultProps: { range: 1000 },
    };
}
