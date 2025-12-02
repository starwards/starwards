import { createMockAsteroid, createMockShip, createMockSpaceDriver, createMockWaypoint } from '../mocks/space-driver';
import { dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawTacticalRadar } from '../../widgets/tactical-radar';

const RANGE = 5000;
const RADAR_RANGE = 6000;
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

export const tacticalRadarScenes: Record<string, Scene> = {
    'tactical-radar-empty': {
        name: 'tactical-radar-empty',
        description: 'Tactical radar with no objects - just grid and range indicators',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);
            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip]);
            const mockShipDriver = createMockShipDriver(playerShip);

            await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer as never, {
                range: RANGE,
            });
        },
    },

    'tactical-radar-single-ship': {
        name: 'tactical-radar-single-ship',
        description: 'Tactical radar with one friendly ship at center',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 45);
            playerShip.velocity.x = 50;
            playerShip.velocity.y = 30;

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip]);
            const mockShipDriver = createMockShipDriver(playerShip);

            await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer as never, {
                range: RANGE,
            });
        },
    },

    'tactical-radar-multiple-objects': {
        name: 'tactical-radar-multiple-objects',
        description: 'Tactical radar with multiple ships, asteroids, and waypoints',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);
            playerShip.velocity.x = 100;
            playerShip.velocity.y = 0;

            // Create other objects using mock factories
            const enemyShip = createMockShip({
                id: 'enemy-1',
                position: { x: 2000, y: 1500 },
                angle: 180,
                faction: 1,
                velocity: { x: -50, y: 20 },
            });

            const friendlyShip = createMockShip({
                id: 'friendly-1',
                position: { x: -1500, y: 1000 },
                angle: 90,
                faction: 0,
            });

            const asteroid1 = createMockAsteroid({
                id: 'asteroid-1',
                position: { x: 1000, y: -1000 },
                radius: 100,
            });

            const asteroid2 = createMockAsteroid({
                id: 'asteroid-2',
                position: { x: -2000, y: -500 },
                radius: 150,
            });

            const waypoint = createMockWaypoint({
                id: 'waypoint-1',
                position: { x: 3000, y: 0 },
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([
                playerShip,
                enemyShip,
                friendlyShip,
                asteroid1,
                asteroid2,
                waypoint,
            ]);
            const mockShipDriver = createMockShipDriver(playerShip);

            await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer as never, {
                range: RANGE,
            });
        },
    },
};
