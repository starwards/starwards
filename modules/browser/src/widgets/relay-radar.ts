import { Container, UPDATE_PRIORITY } from 'pixi.js';
import { Faction, ShipDriver, SpaceDriver, SpaceObject } from '@starwards/core';
import { blue, radarFogOfWar, radarVisibleBg, red, yellow } from '../colors';
import { dradisNoRadiusDrawFunctions, rangeRangeDrawFunctions } from '../radar/blips/blip-renderer';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import EventEmitter from 'eventemitter3';
import { GridLayer } from '../radar/grid-layer';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { SelectionContainer } from '../radar/selection-container';
import WebFont from 'webfontloader';
import { WidgetContainer } from '../container';
import { waitForShip } from '../ship-logic';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const DEFAULT_RANGE = 50_000;

type ZoomEvent = 'zoomIn' | 'zoomOut';

export type RelayRadar = {
    root: CameraView;
    layers: Record<string, Container>;
    stopFollowingShip: () => void;
};

export async function drawRelayRadar(
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    container: WidgetContainer,
    zoomEvents?: EventEmitter<ZoomEvent>,
): Promise<RelayRadar> {
    const camera = new Camera();
    const root = new CameraView(camera);

    if (zoomEvents) {
        zoomEvents.on('zoomIn', () => camera.setZoom(camera.zoom * 1.1));
        zoomEvents.on('zoomOut', () => camera.setZoom(camera.zoom * 0.9));
    }
    container.getElement().bind('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        camera.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
    });

    await root.initialize({ backgroundColor: radarFogOfWar }, container);
    root.canvas.setAttribute('data-id', 'Relay Radar');
    camera.setRange(container.height / 2, DEFAULT_RANGE);
    root.canvas.setAttribute('data-zoom', `${camera.zoom}`);
    root.events.on('screenChanged', () => root.canvas.setAttribute('data-zoom', `${camera.zoom}`));

    const sensorRangeLayer = new ObjectsLayer(
        root,
        spaceDriver,
        64,
        () => radarVisibleBg,
        rangeRangeDrawFunctions,
        undefined,
        (s: SpaceObject) => s.faction === shipDriver.state.faction,
    );
    root.addLayer(sensorRangeLayer.renderRoot);

    const grid = new GridLayer(root);
    root.addLayer(grid.renderRoot);

    const rangeFilter = new RadarRangeFilter(spaceDriver, (o: SpaceObject) => o.faction === shipDriver.state.faction);
    root.ticker.add(rangeFilter.update, null, UPDATE_PRIORITY.UTILITY);

    const getColor = (s: SpaceObject) => {
        if (s.faction === Faction.NONE) return yellow;
        if (s.faction === shipDriver.state.faction) return blue;
        return red;
    };
    const blipLayer = new ObjectsLayer(
        root,
        spaceDriver,
        64,
        getColor,
        dradisNoRadiusDrawFunctions,
        new SelectionContainer().init(spaceDriver),
        rangeFilter.isInRange,
        undefined,
        undefined,
        shipDriver.state.faction,
    );
    root.addLayer(blipLayer.renderRoot);

    let unfollow: (() => void) | null = null;
    let following = true;
    void waitForShip(spaceDriver, shipDriver.id).then((tracked) => {
        const stop = camera.followSpaceObject(tracked, spaceDriver.events);
        if (following) {
            unfollow = stop;
        } else {
            stop();
        }
    });

    return {
        root,
        stopFollowingShip: () => {
            following = false;
            unfollow?.();
            unfollow = null;
        },
        layers: {
            'sensor range': sensorRangeLayer.renderRoot,
            grid: grid.renderRoot,
            objects: blipLayer.renderRoot,
        },
    };
}
