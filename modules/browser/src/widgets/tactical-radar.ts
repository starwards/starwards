import { Graphics, Loader, UPDATE_PRIORITY } from 'pixi.js';
import { ShipDriver, SpaceDriver, SpaceObject } from '@starwards/core';
import { azimuthCircle, crosshairs, speedLines } from '../radar/tactical-radar-layers';
import { green, radarFogOfWar, radarVisibleBg } from '../colors';
import { trackTargetObject, waitForShip } from '../ship-logic';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { DashboardWidget } from './dashboard';
import { MovementAnchorLayer } from '../radar/movement-anchor-layer';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { RangeIndicators } from '../radar/range-indicators';
import WebFont from 'webfontloader';
import { WidgetContainer } from '../container';
import { tacticalDrawFunctions } from '../radar/blips/blip-renderer';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

type Props = { range: number };
export function tacticalRadarWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver): DashboardWidget<Props> {
    return {
        name: 'tactical radar',
        type: 'component',
        component: class {
            constructor(container: WidgetContainer, p: Props) {
                drawTacticalRadar(spaceDriver, shipDriver, container, p);
            }
        },
        defaultProps: { range: 5000 },
    };
}

export function drawTacticalRadar(
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    container: WidgetContainer,
    p: Props
) {
    const camera = new Camera();
    camera.bindRange(container, sizeFactor - sizeFactorGrace, p);
    Loader.shared.load(() => {
        const root = new CameraView({ backgroundColor: radarFogOfWar }, camera, container);
        root.view.setAttribute('data-id', 'Tactical Radar');
        root.setSquare();
        const circleMask = new Graphics();
        root.stage.addChild(circleMask);

        function drawMask() {
            circleMask.clear();
            circleMask.lineStyle(2, 0xff0000, 1);
            circleMask.beginFill(0xff0000, 1);
            circleMask.drawCircle(root.renderer.width / 2, root.renderer.height / 2, root.radius * sizeFactor);
            circleMask.endFill();
        }
        drawMask();
        container.on('resize', drawMask);
        const rangeFilter = new RadarRangeFilter(
            spaceDriver,
            (o: SpaceObject) => o.faction === shipDriver.state.faction
        );
        const fovGraphics = new Graphics();
        fovGraphics.mask = circleMask;
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
        const asimuthCircle = azimuthCircle(root, shipDriver.state, () => 6000);
        root.addLayer(asimuthCircle);
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

        blipLayer.renderRoot.mask = circleMask;
        root.addLayer(blipLayer.renderRoot);

        void waitForShip(spaceDriver, shipDriver.id).then((tracked) =>
            camera.followSpaceObject(tracked, spaceDriver.events, true)
        );
    });
}
