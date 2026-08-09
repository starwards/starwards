import { cataphract, demoShip, makeShipState } from '@starwards/core';
import {
    createMockAsteroid,
    createMockExplosion,
    createMockProjectile,
    createMockShip,
    createMockSpaceDriver,
    createMockWaypoint,
} from '../mocks/space-driver';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawTacticalRadar } from '../../widgets/tactical-radar';
import { setOmniRadarSector } from '@starwards/core';

const RANGE = 5000;
const RADAR_RANGE = 6000;
// Cataphract's chainguns have maxShellRange 10_000 - wider than RANGE, so the firing-arc
// scenes need enough visible range for the arcs' curved edge to land on screen.
const FIRING_ARC_RANGE = 12000;
function createShipWithState(id: string, x = 0, y = 0, angle = 0, radarRange = RADAR_RANGE) {
    const state = makeShipState(id, demoShip);
    state.spaceship.position.x = x;
    state.spaceship.position.y = y;
    state.spaceship.angle = angle;
    state.spaceship.faction = 0;
    setOmniRadarSector(state.spaceship, radarRange);
    for (const radar of state.radars) {
        radar.power = 1;
    }
    return state;
}

export const tacticalRadarScenes: Record<string, Scene> = {
    'tactical-radar-empty': {
        name: 'tactical-radar-empty',
        description: 'Tactical radar with no objects - just grid and range indicators',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);
            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip.spaceship]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer, {
                range: RANGE,
            });
        },
    },

    'tactical-radar-single-ship': {
        name: 'tactical-radar-single-ship',
        description: 'Tactical radar with one friendly ship at center',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 45);
            playerShip.spaceship.velocity.x = 50;
            playerShip.spaceship.velocity.y = 30;

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip.spaceship]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer, {
                range: RANGE,
            });
        },
    },

    'tactical-radar-multiple-objects': {
        name: 'tactical-radar-multiple-objects',
        description: 'Tactical radar with multiple ships, asteroids, and waypoints',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);
            playerShip.spaceship.velocity.x = 100;
            playerShip.spaceship.velocity.y = 0;

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
                playerShip.spaceship,
                enemyShip,
                friendlyShip,
                asteroid1,
                asteroid2,
                waypoint,
            ]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer, {
                range: RANGE,
            });
        },
    },

    'tactical-radar-with-shells': {
        name: 'tactical-radar-with-shells',
        description: 'Tactical radar with cannon shells visible as orange dots',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 45);
            playerShip.spaceship.velocity.x = 50;

            const shell1 = createMockProjectile({ id: 'shell-1', position: { x: 800, y: 200 } });
            const shell2 = createMockProjectile({ id: 'shell-2', position: { x: 1200, y: -300 } });
            const shell3 = createMockProjectile({ id: 'shell-3', position: { x: 400, y: 600 } });

            const enemyShip = createMockShip({
                id: 'enemy-1',
                position: { x: 2000, y: 1500 },
                angle: 180,
                faction: 1,
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip.spaceship, enemyShip, shell1, shell2, shell3]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer, {
                range: RANGE,
            });
        },
    },

    'tactical-radar-with-explosion': {
        name: 'tactical-radar-with-explosion',
        description:
            'An explosion sits between the ship and an asteroid: no blip for the blast itself, but the ' +
            'asteroid behind it stays hidden — the explosion still shadows the field of view',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);

            const blast = createMockExplosion({ id: 'blast-1', position: { x: 1000, y: 0 }, radius: 250 });
            const hiddenAsteroid = createMockAsteroid({
                id: 'hidden-rock',
                position: { x: 1800, y: 0 },
                radius: 100,
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip.spaceship, blast, hiddenAsteroid]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer, {
                range: RANGE,
            });
        },
    },

    'tactical-radar-with-breach-hit': {
        name: 'tactical-radar-with-breach-hit',
        description:
            'Two blasts of the same radius: a normal exterior hit (left) vs a breach hit with its ' +
            'hull-penetration flash (right)',
        async setup(container: HTMLElement) {
            const playerShip = createShipWithState('player', 0, 0, 0);

            const normalBlast = createMockExplosion({
                id: 'normal-blast',
                position: { x: 1000, y: -300 },
                radius: 250,
            });
            const breachBlast = createMockExplosion({
                id: 'breach-blast',
                position: { x: 1000, y: 300 },
                radius: 250,
                breachHit: true,
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([playerShip.spaceship, normalBlast, breachBlast]);
            const mockShipDriver = createMockShipDriver(playerShip);

            return await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer, {
                range: RANGE,
            });
        },
    },

    'tactical-radar-firing-arcs': {
        name: 'tactical-radar-firing-arcs',
        description: "Cataphract's three chain gun mounts, each with a differing fitted bearing",
        async setup(container: HTMLElement) {
            const shipState = makeShipState('player', cataphract);
            shipState.spaceship.position.x = 0;
            shipState.spaceship.position.y = 0;
            shipState.spaceship.angle = 0;
            shipState.spaceship.faction = 0;
            setOmniRadarSector(shipState.spaceship, RADAR_RANGE);
            for (const radar of shipState.radars) {
                radar.power = 1;
            }
            // Give the mounts differing fitted bearings so the arcs are provably centred on
            // their own mount rather than all sharing the ship's nose.
            const bearings = [-45, 0, 45];
            shipState.chainGuns.forEach((chainGun, index) => {
                chainGun.fittedBearing = bearings[index] ?? 0;
            });

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([shipState.spaceship]);
            const mockShipDriver = createMockShipDriver(shipState);

            return await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer, {
                range: FIRING_ARC_RANGE,
            });
        },
    },

    'tactical-radar-firing-arcs-limits': {
        name: 'tactical-radar-firing-arcs-limits',
        description: 'A bearingLimit: 0 mount renders as a single line, a bearingLimit: 180 mount as a full circle',
        async setup(container: HTMLElement) {
            const shipState = makeShipState('player', cataphract);
            shipState.spaceship.position.x = 0;
            shipState.spaceship.position.y = 0;
            shipState.spaceship.angle = 0;
            shipState.spaceship.faction = 0;
            setOmniRadarSector(shipState.spaceship, RADAR_RANGE);
            for (const radar of shipState.radars) {
                radar.power = 1;
            }
            const [lineMount, circleMount, wedgeMount] = shipState.chainGuns;
            lineMount.design.bearingLimit = 0;
            lineMount.fittedBearing = -60;
            circleMount.design.bearingLimit = 180;
            circleMount.fittedBearing = 60;
            wedgeMount.fittedBearing = 0;

            const mockContainer = createMockContainer(container);
            const mockSpaceDriver = createMockSpaceDriver([shipState.spaceship]);
            const mockShipDriver = createMockShipDriver(shipState);

            return await drawTacticalRadar(mockSpaceDriver as never, mockShipDriver as never, mockContainer, {
                range: FIRING_ARC_RANGE,
            });
        },
    },
};
