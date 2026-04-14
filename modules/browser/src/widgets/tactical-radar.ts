import { Graphics, UPDATE_PRIORITY } from 'pixi.js';
import { Projectile, ShipDriver, SpaceDriver, SpaceObject } from '@starwards/core';
import { azimuthCircle, crosshairs, speedLines } from '../radar/tactical-radar-layers';
import { green, radar, radarFogOfWar, radarVisibleBg } from '../colors';
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
                void drawTacticalRadar(spaceDriver, shipDriver, container, p);
            }
        },
        defaultProps: { range: 5000 },
    };
}

export async function drawTacticalRadar(
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    container: WidgetContainer,
    p: Props,
) {
    const camera = new Camera();
    camera.bindRange(container, sizeFactor - sizeFactorGrace, p);
    const root = new CameraView(camera);

    await root.initialize({ backgroundColor: radarFogOfWar }, container);
    root.setSquare();
    root.canvas.setAttribute('data-id', 'Tactical Radar');

    const circleMask = new Graphics();
    root.stage.addChild(circleMask);

    function drawMask() {
        circleMask.clear();
        circleMask
            .circle(root.renderer.width / 2, root.renderer.height / 2, root.radius * sizeFactor)
            .fill({ color: 0xff0000, alpha: 1 })
            .stroke({ width: 2, color: 0xff0000, alpha: 1 });
    }
    drawMask();
    container.on('resize', drawMask);

    const rangeFilter = new RadarRangeFilter(spaceDriver, (o: SpaceObject) => o.faction === shipDriver.state.faction);
    const fovGraphics = new Graphics();
    fovGraphics.mask = circleMask;
    root.stage.addChild(fovGraphics);

    root.ticker.add(
        () => {
            rangeFilter.update();
            fovGraphics.clear();
            for (const fov of rangeFilter.fieldsOfView()) {
                fov.draw(root, fovGraphics);
                fovGraphics.fill({ color: radarVisibleBg, alpha: 1 });
            }
        },
        null,
        UPDATE_PRIORITY.LOW,
    );

    const background = new MovementAnchorLayer(
        root,
        {
            width: 2,
            color: 0xaaffaa,
            alpha: 0.1,
        },
        1000,
        p.range,
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
    // The weapons officer needs visual feedback of the shells they fire, even
    // when the shells fly beyond normal radar-detection range. Shells owned by
    // this ship bypass the range filter and are always shown in shell color.
    const isOwnShell = (o: SpaceObject): o is Projectile => Projectile.isInstance(o) && o.shipId === shipDriver.id;
    const includeInRadar = (o: SpaceObject) => rangeFilter.isInRange(o) || isOwnShell(o);
    const getBlipColor = (s: SpaceObject) => (s.type === 'Projectile' || isOwnShell(s) ? radar.shellTint : green);
    const blipLayer = new ObjectsLayer(
        root,
        spaceDriver,
        32,
        getBlipColor,
        tacticalDrawFunctions,
        shipTarget,
        includeInRadar,
        undefined,
        undefined,
        shipDriver.state.faction,
    );

    blipLayer.renderRoot.mask = circleMask;
    root.addLayer(blipLayer.renderRoot);

    void waitForShip(spaceDriver, shipDriver.id).then((tracked) =>
        camera.followSpaceObject(tracked, spaceDriver.events, true),
    );

    return root;
}
