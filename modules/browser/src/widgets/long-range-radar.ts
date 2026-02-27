import { Graphics, Text, TextStyle, UPDATE_PRIORITY } from 'pixi.js';
import { ShipDriver, SpaceDriver, SpaceObject } from '@starwards/core';
import { green, radarFogOfWar, radarVisibleBg, white } from '../colors';
import { trackTargetObject, waitForShip } from '../ship-logic';

import $ from 'jquery';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { DashboardWidget } from './dashboard';
import EventEmitter from 'eventemitter3';
import { Container as GLContainer } from 'golden-layout';
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

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

// Zoom presets in meters (range visible)
const ZOOM_PRESETS = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000];
const DEFAULT_RANGE = 50_000;

type ZoomEvent = 'zoomIn' | 'zoomOut';

type Props = { range: number };

export function longRangeRadarWidget(
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    stationTarget?: SelectionContainer,
): DashboardWidget<Props> {
    const zoomEvents = new EventEmitter<ZoomEvent>();
    return {
        name: 'long range radar',
        type: 'component',
        component: class {
            constructor(container: WidgetContainer, p: Props) {
                void drawLongRangeRadar(spaceDriver, shipDriver, container, p, zoomEvents, stationTarget);
            }
        },
        defaultProps: { range: DEFAULT_RANGE },
        makeHeaders(_container: GLContainer, _state: unknown): Array<JQuery<HTMLElement>> {
            const zoomIn = $('<i data-id="zoom_in" class="lm_controls tiny material-icons">zoom_in</i>');
            const zoomOut = $('<i data-id="zoom_out" class="lm_controls tiny material-icons">zoom_out</i>');
            zoomIn.mousedown(() => {
                const zoomInterval = setInterval(() => zoomEvents.emit('zoomIn'), 100);
                $(document).mouseup(() => clearInterval(zoomInterval));
            });
            zoomOut.mousedown(() => {
                const zoomInterval = setInterval(() => zoomEvents.emit('zoomOut'), 100);
                $(document).mouseup(() => clearInterval(zoomInterval));
            });
            return [zoomIn, zoomOut];
        },
    };
}

export async function drawLongRangeRadar(
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

    // Bind zoom from header button events
    if (zoomEvents) {
        zoomEvents.on('zoomIn', () => {
            const currentIdx = findClosestRangeIndex(state.range);
            if (currentIdx > 0) {
                state.range = ZOOM_PRESETS[currentIdx - 1];
                updateRange();
            }
        });
        zoomEvents.on('zoomOut', () => {
            const currentIdx = findClosestRangeIndex(state.range);
            if (currentIdx < ZOOM_PRESETS.length - 1) {
                state.range = ZOOM_PRESETS[currentIdx + 1];
                updateRange();
            }
        });
    }

    // Mouse wheel zoom
    container.getElement().bind('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const delta = (e.originalEvent as WheelEvent).deltaY;
        const currentIdx = findClosestRangeIndex(state.range);
        if (delta > 0 && currentIdx < ZOOM_PRESETS.length - 1) {
            state.range = ZOOM_PRESETS[currentIdx + 1];
        } else if (delta < 0 && currentIdx > 0) {
            state.range = ZOOM_PRESETS[currentIdx - 1];
        }
        updateRange();
    });

    await root.initialize({ backgroundColor: radarFogOfWar }, container);
    root.setSquare();
    root.canvas.setAttribute('data-id', 'Long Range Radar');
    root.canvas.setAttribute('data-range', `${state.range}`);

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
        state.range,
    );
    root.addLayer(background.renderRoot);

    const range = new RangeIndicators(root, state.range / 5);
    range.setSizeFactor(sizeFactor);
    root.addLayer(range.renderRoot);

    // Use stationTarget if provided, otherwise fall back to ship's weapons target
    const targetContainer = stationTarget ?? trackTargetObject(spaceDriver, shipDriver);

    const blipLayer = new ObjectsLayer(
        root,
        spaceDriver,
        32,
        () => green,
        tacticalDrawFunctions,
        targetContainer,
        rangeFilter.isInRange,
    );

    blipLayer.renderRoot.mask = circleMask;
    root.addLayer(blipLayer.renderRoot);

    // Zoom level display
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
        camera.setRange(
            ((sizeFactor - sizeFactorGrace) * Math.min(container.width, container.height)) / 2,
            state.range,
        );
        background.setSpacing(state.range / 5);
        background.setRange(state.range);
        range.setStepSize(state.range / 5);
        zoomText.text = formatRange(state.range);
        updateZoomTextPosition();
        root.canvas.setAttribute('data-range', `${state.range}`);
    }

    // Initial range setup
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
