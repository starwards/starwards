import { BLIP_LABEL, DIRECTION_SPRITE_LABEL, dradisNoRadiusDrawFunctions } from '../radar/blips/blip-renderer';
import { Container, Text, UPDATE_PRIORITY } from 'pixi.js';
import { Faction, ShipDriver, SpaceDriver, SpaceObject, radarReach } from '@starwards/core';
import { blue, radarFogOfWar, red, yellow } from '../colors';

import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { DeclutterLayer } from '../radar/blips/declutter-layer';
import { DradisInsets } from '../radar/dradis-insets';
import EventEmitter from 'eventemitter3';
import { GridLayer } from '../radar/grid-layer';
import { ObjectsLayer } from '../radar/blips/objects-layer';
import { RadarRangeFilter } from '../radar/blips/radar-range-filter';
import { SelectionContainer } from '../radar/selection-container';
import WebFont from 'webfontloader';
import { WidgetContainer } from '../container';
import { missileTargetLinesLayer } from '../radar/tactical-radar-layers';
import { waitForShip } from '../ship-logic';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const DEFAULT_RANGE = radarReach.dradis;
const BLIP_SIZE = 64;

type ZoomEvent = 'zoomIn' | 'zoomOut';

export type FollowController = {
    isFollowing: () => boolean;
    setFollow: (follow: boolean) => void;
};

function visibleDescendants(root: Container, label: string): Container[] {
    const result: Container[] = [];
    const walk = (c: Container) => {
        if (!c.visible) return;
        if (c.label === label) result.push(c);
        for (const child of c.children) walk(child);
    };
    walk(root);
    return result;
}

/** Test hooks on the canvas (SPEC-0007 test plan): what the blip layer currently draws. */
function exposeBlipAttributes(canvas: HTMLCanvasElement, blips: Container) {
    canvas.setAttribute('data-direction-sprites', `${visibleDescendants(blips, DIRECTION_SPRITE_LABEL).length}`);
    const labels = visibleDescendants(blips, BLIP_LABEL).map((t) => (t as Text).text);
    canvas.setAttribute('data-labels', JSON.stringify(labels));
}

type DradisRadar = {
    root: CameraView;
    layers: Record<string, Container>;
    follow: FollowController;
    /** World-unit side of the smallest grid cell drawn at the current zoom. */
    cellSize: () => number;
};

export async function drawDradisRadar(
    spaceDriver: SpaceDriver,
    shipDriver: ShipDriver,
    container: WidgetContainer,
    zoomEvents?: EventEmitter<ZoomEvent>,
    /** Px of the canvas's left edge covered by station panels; insets start right of it. */
    insetOffsetX = 0,
): Promise<DradisRadar> {
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
    root.canvas.setAttribute('data-id', 'Dradis Radar');
    camera.setRange(container.height / 2, DEFAULT_RANGE);
    root.canvas.setAttribute('data-zoom', `${camera.zoom}`);
    root.events.on('screenChanged', () => root.canvas.setAttribute('data-zoom', `${camera.zoom}`));

    const grid = new GridLayer(root);
    root.addLayer(grid.renderRoot);

    const rangeFilter = new RadarRangeFilter(spaceDriver, (o: SpaceObject) => o.faction === shipDriver.state.faction);
    root.ticker.add(rangeFilter.update, null, UPDATE_PRIORITY.UTILITY);

    const getColor = (s: SpaceObject) => {
        if (s.faction === Faction.NONE) return yellow;
        if (s.faction === shipDriver.state.faction) return blue;
        return red;
    };
    const selection = new SelectionContainer().init(spaceDriver);
    const blipLayer = new ObjectsLayer(
        root,
        spaceDriver,
        BLIP_SIZE,
        getColor,
        dradisNoRadiusDrawFunctions,
        selection,
        rangeFilter.isInRange,
        undefined,
        undefined,
        shipDriver.state.faction,
    );
    const insets = new DradisInsets(
        root,
        spaceDriver,
        BLIP_SIZE,
        getColor,
        selection,
        rangeFilter.isInRange,
        shipDriver.state.faction,
        () => insetOffsetX,
    );
    const declutter = new DeclutterLayer(BLIP_SIZE, shipDriver.state.faction, () => insets.viewport);
    blipLayer.layout = declutter.layout;
    // group and POI markers sit under the blips, so a named ship inside a cluster stays on top
    root.addLayer(declutter.renderRoot);
    root.addLayer(missileTargetLinesLayer(root, spaceDriver, shipDriver.state.faction, rangeFilter.isInRange));
    root.addLayer(blipLayer.renderRoot);
    root.addLayer(insets.renderRoot);
    root.ticker.add(
        () => {
            const { groups, pois } = declutter.result;
            insets.update(pois);
            exposeBlipAttributes(root.canvas, blipLayer.renderRoot);
            root.canvas.setAttribute('data-groups', `${groups.length}`);
            root.canvas.setAttribute('data-pois', `${pois.length}`);
            root.canvas.setAttribute('data-insets', `${insets.insetRects.length}`);
            root.canvas.setAttribute('data-inset-rects', JSON.stringify(insets.insetRects));
        },
        null,
        UPDATE_PRIORITY.UTILITY,
    );

    let unfollow: (() => void) | null = null;
    let following = true;
    let trackedShip: SpaceObject | null = null;
    const applyFollow = () => {
        root.canvas.setAttribute('data-following', `${following}`);
        if (!trackedShip) return;
        if (following && !unfollow) {
            camera.set(trackedShip.position);
            unfollow = camera.followSpaceObject(trackedShip, spaceDriver.events);
        } else if (!following && unfollow) {
            unfollow();
            unfollow = null;
        }
    };
    applyFollow();

    // clicks on an inset or POI marker zoom onto it and never reach the selection layers (capture phase)
    let swallowUp = false;
    const canvasPoint = (e: PointerEvent) => {
        const bounds = root.canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - bounds.left) * root.renderer.width) / bounds.width,
            y: ((e.clientY - bounds.top) * root.renderer.height) / bounds.height,
        };
    };
    const onPointerDown = (e: PointerEvent) => {
        if (e.target !== root.canvas) return;
        const hit = insets.hit(canvasPoint(e));
        if (!hit) return;
        e.stopPropagation();
        swallowUp = true;
        following = false;
        applyFollow();
        camera.set(hit.center);
        camera.setZoom(hit.zoom);
    };
    const onPointerUp = (e: PointerEvent) => {
        if (!swallowUp) return;
        swallowUp = false;
        e.stopPropagation();
    };
    const element = container.getElement()[0];
    element.addEventListener('pointerdown', onPointerDown, true);
    element.addEventListener('pointerup', onPointerUp, true);

    void waitForShip(spaceDriver, shipDriver.id).then((tracked) => {
        trackedShip = tracked;
        applyFollow();
    });

    return {
        root,
        cellSize: () => grid.cellSize,
        follow: {
            isFollowing: () => following,
            setFollow: (follow: boolean) => {
                following = follow;
                applyFollow();
            },
        },
        layers: {
            grid: grid.renderRoot,
            objects: blipLayer.renderRoot,
        },
    };
}
