import { Container, Graphics, UPDATE_PRIORITY } from 'pixi.js';
import { ShipDriver, SpaceDriver, SpaceObject, XY, calcArcAngle, degToRad } from '@starwards/core';
import { aggregate, readProp } from '../property-wrappers';
import { azimuthCircle, speedLines } from '../radar/tactical-radar-layers';
import { green, radarFogOfWar, radarVisibleBg } from '../colors';
import { tacticalDrawFunctions, tacticalDrawWaypoints } from '../radar/blips/blip-renderer';
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

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

type Props = { range: number };
export function pilotRadarWidget(spaceDriver: SpaceDriver, shipDriver: ShipDriver): DashboardWidget<Props> {
    return {
        name: 'pilot radar',
        type: 'component',
        component: class {
            constructor(container: WidgetContainer, _p: Props) {
                drawPilotRadar(spaceDriver, shipDriver, container);
            }
        },
        defaultProps: { range: 5000 },
    };
}

export function drawPilotRadar(spaceDriver: SpaceDriver, shipDriver: ShipDriver, container: WidgetContainer) {
    const warpLevelProp = readProp<number>(shipDriver, '/warp/currentLevel');
    const isWarpProp = aggregate([warpLevelProp], () => {
        const warpLevel = warpLevelProp.getValue();
        return warpLevel !== undefined && warpLevel > 0.5;
    });
    const camera = new Camera();
    const p = { range: isWarpProp.getValue() ? 100_000 : 5_000 };
    const root = new CameraView({ backgroundColor: radarFogOfWar }, camera, container);
    root.view.setAttribute('data-id', 'Pilot Radar');

    const overallMask = new Graphics();
    root.stage.addChild(overallMask);
    const allElements = new Container();
    root.addLayer(allElements);
    allElements.mask = overallMask;

    const contentMask = new Graphics();
    root.stage.addChild(contentMask);
    const contentElements = new Container();
    allElements.addChild(contentElements);
    contentElements.mask = contentMask;

    const rangeFilter = new RadarRangeFilter(
        spaceDriver,
        (o: SpaceObject) => o.faction === shipDriver.state.spaceObject.faction,
    );
    const fovGraphics = new Graphics();
    contentElements.addChild(fovGraphics);

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
    contentElements.addChild(background.renderRoot);
    const range = new RangeIndicators(root, p.range / 5);
    range.setSizeFactor(sizeFactor);
    allElements.addChild(range.renderRoot);
    allElements.addChild(azimuthCircle(root, shipDriver.state, () => p.range * 1.2));
    const shipTarget = trackTargetObject(spaceDriver, shipDriver);

    contentElements.addChild(speedLines(root, shipDriver.state, shipTarget));
    const blipLayer = new ObjectsLayer(
        root,
        spaceDriver,
        32,
        () => green,
        tacticalDrawFunctions,
        shipTarget,
        rangeFilter.isInRange,
    );
    contentElements.addChild(blipLayer.renderRoot);
    const waypointsInRange = new ObjectsLayer(
        root,
        spaceDriver,
        32,
        (w) => w.color,
        tacticalDrawWaypoints,
        undefined,
        (w) => XY.lengthOf(XY.difference(w.position, camera)) <= p.range,
    );
    contentElements.addChild(waypointsInRange.renderRoot);

    const waypointsOutOfRange = new ObjectsLayer(
        root,
        spaceDriver,
        16,
        (w) => w.color,
        tacticalDrawWaypoints,
        undefined,
        (w) =>
            w.owner === shipDriver.id &&
            w.collection === 'route' &&
            XY.lengthOf(XY.difference(w.position, camera)) > p.range,
        (w) =>
            root.worldToScreen(
                XY.add(camera, XY.byLengthAndDirection(p.range, XY.angleOf(XY.difference(w.position, camera)))),
            ),
        () => 0.5,
    );
    allElements.addChild(waypointsOutOfRange.renderRoot);

    function onRadarShapeChange() {
        overallMask.clear();
        overallMask.lineStyle(2, 0xff0000, 1);
        overallMask.beginFill(0xff0000, 1);
        contentMask.clear();
        contentMask.lineStyle(2, 0xff0000, 1);
        contentMask.beginFill(0xff0000, 1);
        if (isWarpProp.getValue()) {
            // cone shape
            const radius = root.renderer.height;
            const arcAngle = calcArcAngle(root.renderer.width, radius);
            const coneCorner = { x: root.renderer.width / 2, y: radius };
            overallMask.moveTo(...XY.tuple(coneCorner));
            overallMask.arc(
                ...XY.tuple(coneCorner),
                radius,
                degToRad * (-90 - arcAngle / 2),
                degToRad * (-90 + arcAngle / 2),
            );
            camera.setRange(((sizeFactor - sizeFactorGrace) * container.height) / 2, p.range);
            allElements.x = -root.renderer.width / 2;
            allElements.scale = { x: 2, y: 2 };
            contentMask.drawCircle(...XY.tuple(coneCorner), radius * sizeFactor);
        } else {
            // circle shape
            overallMask.drawCircle(root.renderer.width / 2, root.renderer.height / 2, root.radius);
            contentMask.drawCircle(root.renderer.width / 2, root.renderer.height / 2, root.radius * sizeFactor);
            allElements.x = 0;
            allElements.scale = { x: 1, y: 1 };
            camera.setRange(
                ((sizeFactor - sizeFactorGrace) * Math.min(container.width, container.height)) / 2,
                p.range,
            );
        }
        overallMask.endFill();
        contentMask.endFill();
    }
    function onRangeChange() {
        p.range = isWarpProp.getValue() ? 100_000 : 5_000;
        background.setSpacing(p.range / 5);
        background.setRange(p.range);
        range.setStepSize(p.range / 5);
        onRadarShapeChange();
    }
    container.on('resize', onRadarShapeChange);
    isWarpProp.onChange(onRangeChange);
    onRangeChange();
    void waitForShip(spaceDriver, shipDriver.id).then((tracked) =>
        camera.followSpaceObject(tracked, spaceDriver.events, true),
    );
}
