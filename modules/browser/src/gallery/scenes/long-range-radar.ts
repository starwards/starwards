import { createMockAsteroid, createMockShip, createMockSpaceDriver, createMockWaypoint } from '../mocks/space-driver';
import { dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawLongRangeRadar } from '../../widgets/long-range-radar';

const DEFAULT_RANGE = 50_000;
const RADAR_RANGE = 60_000;

function createShipWithState(id: string, x = 0, y = 0, angle = 0, radarRange = RADAR_RANGE) {
    const state = makeShipState(id, dragonflySF22);
    state.position.x = x;
    state.position.y = y;
    state.angle = angle;
    state.faction = 0;
    state.radarRange = radarRange;
    state.radar.power = 1;
    return state;
}

export const longRangeRadarScenes: Record<string, Scene> = {
    'long-range-radar-empty': {
        name: 'long-range-radar-empty',
        description: 'Long range radar with no objects - just grid and range indicators',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);
            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawLongRangeRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer as never, {
                range: DEFAULT_RANGE,
            });
        },
    },

    'long-range-radar-single-ship': {
        name: 'long-range-radar-single-ship',
        description: 'Long range radar with one friendly ship at center',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 45);
            playerShip.velocity.x = 500;
            playerShip.velocity.y = 300;

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawLongRangeRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer as never, {
                range: DEFAULT_RANGE,
            });
        },
    },

    'long-range-radar-multiple-objects': {
        name: 'long-range-radar-multiple-objects',
        description: 'Long range radar with multiple ships, asteroids, and waypoints at long distances',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);
            playerShip.velocity.x = 1000;
            playerShip.velocity.y = 0;

            // Enemy ship at long range
            const enemyShip = createMockShip({
                id: 'enemy-1',
                position: { x: 30000, y: 20000 },
                angle: 180,
                faction: 1,
                velocity: { x: -500, y: 200 },
            });

            // Friendly ship at medium range
            const friendlyShip = createMockShip({
                id: 'friendly-1',
                position: { x: -15000, y: 10000 },
                angle: 90,
                faction: 0,
            });

            // Another enemy at extreme range
            const farEnemy = createMockShip({
                id: 'enemy-2',
                position: { x: -40000, y: -25000 },
                angle: 45,
                faction: 1,
            });

            // Asteroids scattered around
            const asteroid1 = createMockAsteroid({
                id: 'asteroid-1',
                position: { x: 10000, y: -15000 },
                radius: 500,
            });

            const asteroid2 = createMockAsteroid({
                id: 'asteroid-2',
                position: { x: -25000, y: -5000 },
                radius: 800,
            });

            const asteroid3 = createMockAsteroid({
                id: 'asteroid-3',
                position: { x: 35000, y: -10000 },
                radius: 300,
            });

            // Waypoints at various distances
            const waypoint1 = createMockWaypoint({
                id: 'waypoint-1',
                position: { x: 45000, y: 0 },
            });

            const waypoint2 = createMockWaypoint({
                id: 'waypoint-2',
                position: { x: -20000, y: 30000 },
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([
                playerShip,
                enemyShip,
                friendlyShip,
                farEnemy,
                asteroid1,
                asteroid2,
                asteroid3,
                waypoint1,
                waypoint2,
            ]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawLongRangeRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer as never, {
                range: DEFAULT_RANGE,
            });
        },
    },

    'long-range-radar-zoomed-in': {
        name: 'long-range-radar-zoomed-in',
        description: 'Long range radar zoomed in to 10km range',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);

            const nearbyShip = createMockShip({
                id: 'nearby-1',
                position: { x: 5000, y: 3000 },
                angle: 270,
                faction: 1,
            });

            const asteroid = createMockAsteroid({
                id: 'asteroid-1',
                position: { x: -4000, y: 2000 },
                radius: 200,
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip, nearbyShip, asteroid]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawLongRangeRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer as never, {
                range: 10_000,
            });
        },
    },

    'long-range-radar-zoomed-out': {
        name: 'long-range-radar-zoomed-out',
        description: 'Long range radar zoomed out to 250km range',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);

            // Very distant objects
            const distantShip1 = createMockShip({
                id: 'distant-1',
                position: { x: 100000, y: 80000 },
                angle: 180,
                faction: 1,
            });

            const distantShip2 = createMockShip({
                id: 'distant-2',
                position: { x: -150000, y: 50000 },
                angle: 90,
                faction: 0,
            });

            const waypoint = createMockWaypoint({
                id: 'waypoint-1',
                position: { x: 200000, y: -100000 },
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip, distantShip1, distantShip2, waypoint]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawLongRangeRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer as never, {
                range: 250_000,
            });
        },
    },
};
