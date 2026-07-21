import { Graphics, Text, TextStyle, UPDATE_PRIORITY } from 'pixi.js';
import { ShipDriver, SpaceDriver, SpaceObject } from '@starwards/core';
import { green, radarFogOfWar, radarVisibleBg, white } from '../colors';
import { trackTargetObject, waitForShip } from '../ship-logic';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import EventEmitter from 'eventemitter3';
import { MovementAnchorLayer } from '../radar/movement-anchor-layer';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { RangeIndicators } from '../radar/range-indicators';
import { SelectionContainer } from '../radar/selection-container';
import WebFont from 'webfontloader';
import { WidgetContainer } from '../container';
import { tacticalDrawFunctions } from '../radar/blips/blip-renderer';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const ZOOM_PRESETS = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000];
const DEFAULT_RANGE = 50_000;

type ZoomEvent = 'zoomIn' | 'zoomOut';

export type Props = { range: number };

export async function drawRelayRadar(
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    container: WidgetContainer,
    p: Props,
    zoomEvents?: EventEmitter<ZoomEvent>,
    stationTarget?: SelectionContainer,
) {
    const state = { range: p.range };
    const camera = new Camera();
    const root = new CameraView(camera);

    function stepZoom(direction: number) {
        const currentIdx = findClosestRangeIndex(state.range);
        if (direction > 0 && currentIdx < ZOOM_PRESETS.length - 1) {
            state.range = ZOOM_PRESETS[currentIdx + 1];
        } else if (direction < 0 && currentIdx > 0) {
            state.range = ZOOM_PRESETS[currentIdx - 1];
        } else {
            return;
        }
        updateRange();
    }

    if (zoomEvents) {
        zoomEvents.on('zoomIn', () => stepZoom(-1));
        zoomEvents.on('zoomOut', () => stepZoom(1));
    }

    const ZOOM_COOLDOWN_MS = 200;
    let lastZoomTime = 0;
    container.getElement().bind('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const now = Date.now();
        if (now - lastZoomTime < ZOOM_COOLDOWN_MS) return;
        lastZoomTime = now;
        stepZoom((e.originalEvent as WheelEvent).deltaY);
    });

    await root.initialize({ backgroundColor: radarFogOfWar }, container);
    // rectangular — no setSquare(), no circular mask
    root.canvas.setAttribute('data-id', 'Relay Radar');
    root.canvas.setAttribute('data-range', `${state.range}`);

    const rangeFilter = new RadarRangeFilter(spaceDriver, (o: SpaceObject) => o.faction === shipDriver.state.faction);
    const fovGraphics = new Graphics();
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
        state.range,
    );
    root.addLayer(background.renderRoot);

    const rangeIndicators = new RangeIndicators(root, state.range / 5);
    root.addLayer(rangeIndicators.renderRoot);

    const targetContainer = stationTarget ?? trackTargetObject(spaceDriver, shipDriver);

    const blipLayer = new ObjectsLayer(
        root,
        spaceDriver,
        32,
        () => green,
        tacticalDrawFunctions,
        targetContainer,
        rangeFilter.isInRange,
        undefined,
        undefined,
        shipDriver.state.faction,
    );
    root.addLayer(blipLayer.renderRoot);

    const zoomText = new Text(
        formatRange(state.range),
        new TextStyle({
            fontFamily: 'Bebas',
            fontSize: 16,
            fill: white,
            align: 'right',
        }),
    );
    zoomText.alpha = 0.7;
    root.stage.addChild(zoomText);

    function updateZoomTextPosition() {
        zoomText.x = root.renderer.width - zoomText.width - 10;
        zoomText.y = 10;
    }
    updateZoomTextPosition();
    container.on('resize', updateZoomTextPosition);

    function updateRange() {
        camera.setRange(container.height / 2, state.range);
        background.setSpacing(state.range / 5);
        background.setRange(state.range);
        rangeIndicators.setStepSize(state.range / 5);
        zoomText.text = formatRange(state.range);
        updateZoomTextPosition();
        root.canvas.setAttribute('data-range', `${state.range}`);
    }

    updateRange();
    container.on('resize', updateRange);

    void waitForShip(spaceDriver, shipDriver.id).then((tracked) =>
        camera.followSpaceObject(tracked, spaceDriver.events, true),
    );

    return root;
}

function findClosestRangeIndex(currentRange: number): number {
    let closest = 0;
    let minDiff = Math.abs(ZOOM_PRESETS[0] - currentRange);
    for (let i = 1; i < ZOOM_PRESETS.length; i++) {
        const diff = Math.abs(ZOOM_PRESETS[i] - currentRange);
        if (diff < minDiff) {
            minDiff = diff;
            closest = i;
        }
    }
    return closest;
}

function formatRange(range: number): string {
    if (range >= 1000) {
        return `${(range / 1000).toFixed(0)}km`;
    }
    return `${range}m`;
}

export { DEFAULT_RANGE };
