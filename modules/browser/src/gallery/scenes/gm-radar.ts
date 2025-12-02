import { AlphaFilter, Graphics, UPDATE_PRIORITY } from 'pixi.js';
import { Faction, dragonflySF22, makeShipState } from '@starwards/core';
import { blue, radarVisibleBg, red, yellow } from '../../colors';
import { createMockAsteroid, createMockSpaceDriver, createMockWaypoint } from '../mocks/space-driver';
import { tacticalDrawFunctions, tacticalDrawWaypoints } from '../../radar/blips/blip-renderer';

import { Camera } from '../../radar/camera';
import { CameraView } from '../../radar/camera-view';
import { GridLayer } from '../../radar/grid-layer';
import { ObjectsLayer } from '../../radar/blips/objects-layer';
import { RadarRangeFilter } from '../../radar/blips/radar-range-filter';
import { Scene } from './index';
import { createMockContainer } from '../mocks/container';

const ZOOM = 0.1;
function getFactionColor(faction: Faction): number {
    switch (faction) {
        case Faction.Gravitas:
            return red;
        case Faction.Raiders:
            return blue;
        default:
            return yellow;
    }
}

function addFovRendering(root: CameraView, mockSpaceDriver: ReturnType<typeof createMockSpaceDriver>) {
    const rangeFilter = new RadarRangeFilter(mockSpaceDriver as never);
    root.ticker.add(rangeFilter.update, null, UPDATE_PRIORITY.LOW);

    for (let faction = 0; faction < (Faction.FACTION_COUNT as number); faction++) {
        const fovGraphics = new Graphics();
        fovGraphics.filters = [new AlphaFilter({ alpha: 0.1 })];
        root.addLayer(fovGraphics);

        root.ticker.add(
            () => {
                fovGraphics.clear();
                for (const fov of rangeFilter.fieldsOfView()) {
                    if ((fov.object.faction as number) === faction) {
                        fov.draw(root, fovGraphics);
                        fovGraphics.fill({ color: getFactionColor(faction), alpha: 1 });
                    }
                }
            },
            null,
            UPDATE_PRIORITY.LOW,
        );
    }
}

function createFactionShip(id: string, x: number, y: number, faction: Faction, angle = 0) {
    const state = makeShipState(id, dragonflySF22);
    state.position.x = x;
    state.position.y = y;
    state.angle = angle;
    state.faction = faction;
    state.radarRange = 5000;
    state.radar.power = 1;
    return state;
}

export const gmRadarScenes: Record<string, Scene> = {
    'gm-radar-empty': {
        name: 'gm-radar-empty',
        description: 'GM radar with grid only, no objects',
        async setup(container: HTMLElement) {
            const mockContainer = createMockContainer(container);
            const camera = new Camera();
            camera.setZoom(ZOOM);

            const root = new CameraView(camera);
            await root.initialize({ backgroundColor: radarVisibleBg }, mockContainer as never);
            root.canvas.setAttribute('data-id', 'GM Radar');

            const grid = new GridLayer(root);
            root.addLayer(grid.renderRoot);

            return root;
        },
    },

    'gm-radar-ships': {
        name: 'gm-radar-ships',
        description: 'GM radar with multiple ships of different factions and FOV',
        async setup(container: HTMLElement) {
            const gravitasShip = createFactionShip('gravitas-1', 0, 0, Faction.Gravitas, 0);
            const raidersShip = createFactionShip('raiders-1', 3000, 2000, Faction.Raiders, 90);
            const neutralShip = createFactionShip('neutral-1', -2500, 1500, Faction.NONE, 45);

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([gravitasShip, raidersShip, neutralShip]);

            const camera = new Camera();
            camera.setZoom(ZOOM);

            const root = new CameraView(camera);
            await root.initialize({ backgroundColor: radarVisibleBg }, mockContainer as never);
            root.canvas.setAttribute('data-id', 'GM Radar');

            const grid = new GridLayer(root);
            root.addLayer(grid.renderRoot);
            addFovRendering(root, mockSpaceDriver);

            const blipLayer = new ObjectsLayer(
                root,
                mockSpaceDriver as never,
                64,
                (s) => getFactionColor(s.faction),
                tacticalDrawFunctions,
            );
            root.addLayer(blipLayer.renderRoot);

            return root;
        },
    },

    'gm-radar-mixed': {
        name: 'gm-radar-mixed',
        description: 'GM radar with ships, asteroids, waypoints, and FOV',
        async setup(container: HTMLElement) {
            const gravitasShip = createFactionShip('gravitas-1', 0, 0, Faction.Gravitas, 0);
            const raidersShip = createFactionShip('raiders-1', 2500, 1500, Faction.Raiders, 180);

            const asteroid1 = createMockAsteroid({
                id: 'asteroid-1',
                position: { x: -2000, y: 1000 },
                radius: 150,
            });
            const asteroid2 = createMockAsteroid({
                id: 'asteroid-2',
                position: { x: 1500, y: -1500 },
                radius: 200,
            });

            const waypoint = createMockWaypoint({
                id: 'waypoint-1',
                position: { x: 3500, y: 0 },
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([gravitasShip, raidersShip, asteroid1, asteroid2, waypoint]);

            const camera = new Camera();
            camera.setZoom(ZOOM);

            const root = new CameraView(camera);
            await root.initialize({ backgroundColor: radarVisibleBg }, mockContainer as never);
            root.canvas.setAttribute('data-id', 'GM Radar');

            const grid = new GridLayer(root);
            root.addLayer(grid.renderRoot);

            addFovRendering(root, mockSpaceDriver);

            const blipLayer = new ObjectsLayer(
                root,
                mockSpaceDriver as never,
                64,
                (s) => getFactionColor(s.faction),
                tacticalDrawFunctions,
            );
            root.addLayer(blipLayer.renderRoot);

            const waypointsLayer = new ObjectsLayer(
                root,
                mockSpaceDriver as never,
                32,
                (w) => w.color,
                tacticalDrawWaypoints,
            );
            root.addLayer(waypointsLayer.renderRoot);

            return root;
        },
    },
};
