import { dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawEngineeringStatus } from '../../widgets/enginering-status';

export const engineeringStatusScenes: Record<string, Scene> = {
    'engineering-status-ecr-control': {
        name: 'engineering-status-ecr-control',
        description: 'Engineering status panel with ECR control mode enabled',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.ecrControl = true;
            ship.reactor.energy = 800;
            ship.maneuvering.afterBurnerFuel = 100;

            const mockContainer = createMockContainer(container, 300, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawEngineeringStatus(mockContainer, mockShipDriver as never);
        },
    },

    'engineering-status-bridge-control': {
        name: 'engineering-status-bridge-control',
        description: 'Engineering status panel with Bridge control mode',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.ecrControl = false;
            ship.reactor.energy = 800;
            ship.maneuvering.afterBurnerFuel = 100;

            const mockContainer = createMockContainer(container, 300, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawEngineeringStatus(mockContainer, mockShipDriver as never);
        },
    },

    'engineering-status-low-energy': {
        name: 'engineering-status-low-energy',
        description: 'Engineering status panel with low energy state',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.ecrControl = true;
            ship.reactor.energy = 50;
            ship.maneuvering.afterBurnerFuel = 20;

            const mockContainer = createMockContainer(container, 300, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawEngineeringStatus(mockContainer, mockShipDriver as never);
        },
    },

    'engineering-status-full-energy': {
        name: 'engineering-status-full-energy',
        description: 'Engineering status panel with full energy state',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.ecrControl = true;
            ship.reactor.energy = ship.reactor.design.maxEnergy;
            ship.maneuvering.afterBurnerFuel = ship.maneuvering.design.maxAfterBurnerFuel;

            const mockContainer = createMockContainer(container, 300, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawEngineeringStatus(mockContainer, mockShipDriver as never);
        },
    },

    'engineering-status-hull-ok': {
        name: 'engineering-status-hull-ok',
        description: 'Engineering status panel with hull OK',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.hullDamaged = false;
            ship.reactor.energy = 800;
            ship.maneuvering.afterBurnerFuel = 100;

            const mockContainer = createMockContainer(container, 300, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawEngineeringStatus(mockContainer, mockShipDriver as never);
        },
    },

    'engineering-status-hull-damaged': {
        name: 'engineering-status-hull-damaged',
        description: 'Engineering status panel with hull DAMAGED',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.hullDamaged = true;
            ship.reactor.energy = 800;
            ship.maneuvering.afterBurnerFuel = 100;

            const mockContainer = createMockContainer(container, 300, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawEngineeringStatus(mockContainer, mockShipDriver as never);
        },
    },
};
