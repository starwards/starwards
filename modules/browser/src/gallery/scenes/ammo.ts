import { demoShip, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawAmmoStatus } from '../../widgets/ammo';

export const ammoScenes: Record<string, Scene> = {
    'ammo-full': {
        name: 'ammo-full',
        description: 'Ammunition panel with full ammo',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            // Magazine is initialized with full ammo by makeShipState

            const mockContainer = createMockContainer(container, 250, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawAmmoStatus(mockContainer, mockShipDriver as never);
        },
    },

    'ammo-low': {
        name: 'ammo-low',
        description: 'Ammunition panel with low ammo',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            ship.magazine.count_HiExpShell = Math.round(ship.magazine.max_HiExpShell * 0.2);
            ship.magazine.count_ArmPenShell = Math.round(ship.magazine.max_ArmPenShell * 0.2);
            ship.magazine.count_FragShell = Math.round(ship.magazine.max_FragShell * 0.1);
            ship.magazine.count_HiExpMissile = Math.round(ship.magazine.max_HiExpMissile * 0.3);
            ship.magazine.count_ArmPenMissile = Math.round(ship.magazine.max_ArmPenMissile * 0.3);
            ship.magazine.count_FragMissile = Math.round(ship.magazine.max_FragMissile * 0.2);
            ship.magazine.count_ClusterMissile = Math.round(ship.magazine.max_ClusterMissile * 0.3);
            ship.magazine.count_TandemMissile = Math.round(ship.magazine.max_TandemMissile * 0.3);
            ship.magazine.count_ElecMissile = Math.round(ship.magazine.max_ElecMissile * 0.3);

            const mockContainer = createMockContainer(container, 250, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawAmmoStatus(mockContainer, mockShipDriver as never);
        },
    },

    'ammo-empty': {
        name: 'ammo-empty',
        description: 'Ammunition panel with no ammo',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            ship.magazine.count_HiExpShell = 0;
            ship.magazine.count_ArmPenShell = 0;
            ship.magazine.count_FragShell = 0;
            ship.magazine.count_HiExpMissile = 0;
            ship.magazine.count_ArmPenMissile = 0;
            ship.magazine.count_FragMissile = 0;
            ship.magazine.count_ClusterMissile = 0;
            ship.magazine.count_TandemMissile = 0;
            ship.magazine.count_ElecMissile = 0;

            const mockContainer = createMockContainer(container, 250, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawAmmoStatus(mockContainer, mockShipDriver as never);
        },
    },
};
