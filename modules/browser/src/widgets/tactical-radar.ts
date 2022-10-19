import { Graphics, Loader, UPDATE_PRIORITY } from 'pixi.js';
import { ShipDriver, SpaceDriver, SpaceObject, degToRad } from '@starwards/core';
import { crosshairs, speedLines } from '../radar/tactical-radar-layers';
import { green, radarFogOfWar, radarVisibleBg } from '../colors';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { MovementAnchorLayer } from '../radar/movement-anchor-layer';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { RangeIndicators } from '../radar/range-indicators';
import { SpriteLayer } from '../radar/sprite-layer';
import WebFont from 'webfontloader';
import { tacticalDrawFunctions } from '../radar/blips/blip-renderer';
import { trackTargetObject } from '../ship-logic';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const preloadList = ['images/radar/target.png', 'images/radar/deflection.png', 'images/asimuth-circle.svg'];

Loader.shared.add(preloadList);

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

type Props = { range: number };
export function tacticalRadarWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver): DashboardWidget<Props> {
    class TacticalRadarComponent {
        constructor(container: Container, p: Props) {
            const camera = new Camera();
            camera.bindRange(container, sizeFactor - sizeFactorGrace, p);
            Loader.shared.load(() => {
                const root = new CameraView({ backgroundColor: radarFogOfWar }, camera, container);
                root.view.setAttribute('data-id', 'Tactical Radar');
                root.setSquare();
                const rangeFilter = new RadarRangeFilter(
                    spaceDriver,
                    (o: SpaceObject) => o.faction === shipDriver.state.faction
                );
                const fovGraphics = new Graphics();
                root.stage.addChild(fovGraphics);

                root.ticker.add(
                    () => {
                        rangeFilter.update();
                        fovGraphics.clear();
                        fovGraphics.lineStyle(0);
                        for (const fov of rangeFilter.fieldsOfView()) {
                            fovGraphics.beginFill(radarVisibleBg, 1);
                            fov.draw(root, fovGraphics);
                            fovGraphics.endFill();
                        }
                    },
                    null,
                    UPDATE_PRIORITY.LOW
                );

                const background = new MovementAnchorLayer(
                    root,
                    {
                        width: 2,
                        color: 0xaaffaa,
                        alpha: 0.1,
                    },
                    1000,
                    p.range
                );
                root.addLayer(background.renderRoot);
                const range = new RangeIndicators(root, p.range / 5);
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
                const shipTarget = trackTargetObject(spaceDriver, shipDriver);
                if (shipDriver.state.chainGun) {
                    root.addLayer(crosshairs(root, shipDriver.state, shipDriver.state.chainGun, shipTarget));
                }
                root.addLayer(speedLines(root, shipDriver.state, shipTarget));
                const blipLayer = new ObjectsLayer(
                    root,
                    spaceDriver,
                    32,
                    () => green,
                    tacticalDrawFunctions,
                    shipTarget,
                    rangeFilter.isInRange
                );
                root.addLayer(blipLayer.renderRoot);

                void spaceDriver
                    .waitForObject(shipDriver.id)
                    .then((tracked) => camera.followSpaceObject(tracked, spaceDriver.events, true));
            });
        }
    }

    return {
        name: 'tactical radar',
        type: 'component',
        component: TacticalRadarComponent,
        defaultProps: { range: 5000 },
    };
}
