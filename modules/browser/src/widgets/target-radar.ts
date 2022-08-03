import { Graphics, Loader, UPDATE_PRIORITY } from 'pixi.js';
import { ShipDriver, SpaceDriver } from '@starwards/model';
import { green, radarFogOfWar, radarVisibleBg } from '../colors';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import EventEmitter from 'eventemitter3';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { RangeIndicators } from '../radar/range-indicators';
import { SelectionContainer } from '../radar/selection-container';
import { SpaceObject } from '@starwards/model';
import WebFont from 'webfontloader';
import { crosshairs } from '../radar/tactical-radar-layers';
import { tacticalDrawFunctions } from '../radar/blips/blip-renderer';
import { trackTargetObject } from '../ship-logic';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

function trackObject(camera: Camera, changeEvents: EventEmitter, target: SelectionContainer) {
    let unfollow = (): void => undefined;
    const follow = () => {
        unfollow();
        const tracked = target.getSingle();
        if (tracked) {
            unfollow = camera.followSpaceObject(tracked, changeEvents);
        }
    };
    target.events.on('changed', follow);
    follow();
}

export type Props = { range: number };
export function targetRadarWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver): DashboardWidget<Props> {
    class TargetRadarComponent {
        constructor(container: Container, p: Props) {
            const camera = new Camera();
            camera.bindRange(container, sizeFactor - sizeFactorGrace, p);

            Loader.shared.load(() => {
                const root = new CameraView({ backgroundColor: radarFogOfWar }, camera, container);
                root.setSquare();
                const rangeFilter = new RadarRangeFilter(
                    spaceDriver,
                    (o: SpaceObject) => o.faction === shipDriver.faction.getValue()
                );
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
                const fovGraphics = new Graphics();
                root.stage.addChild(fovGraphics);
                const range = new RangeIndicators(root, p.range / 5);
                range.setSizeFactor(sizeFactor);
                root.addLayer(range.renderRoot);
                const shipTarget = trackTargetObject(spaceDriver, shipDriver);
                root.addLayer(crosshairs(root, shipDriver.state, shipTarget));
                const blipLayer = new ObjectsLayer(
                    root,
                    spaceDriver,
                    64,
                    () => green,
                    tacticalDrawFunctions,
                    shipTarget,
                    rangeFilter.isInRange
                );
                root.addLayer(blipLayer.renderRoot);
                trackObject(camera, spaceDriver.events, shipTarget);
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
