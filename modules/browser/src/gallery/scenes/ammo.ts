import { dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawAmmoStatus } from '../../widgets/ammo';

export const ammoScenes: Record<string, Scene> = {
    'ammo-full': {
        name: 'ammo-full',
        description: 'Ammunition panel with full ammo',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
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
            const ship = makeShipState('player', dragonflySF22);
            ship.magazine.count_CannonHe = Math.round(ship.magazine.max_CannonHe * 0.2);
            ship.magazine.count_CannonAp = Math.round(ship.magazine.max_CannonAp * 0.2);
            ship.magazine.count_CannonFrag = Math.round(ship.magazine.max_CannonFrag * 0.1);
            ship.magazine.count_MissileHe = Math.round(ship.magazine.max_MissileHe * 0.3);
            ship.magazine.count_MissileSabot = Math.round(ship.magazine.max_MissileSabot * 0.3);
            ship.magazine.count_MissileCluster = Math.round(ship.magazine.max_MissileCluster * 0.3);
            ship.magazine.count_MissileTandem = Math.round(ship.magazine.max_MissileTandem * 0.3);
            ship.magazine.count_MissileEmp = Math.round(ship.magazine.max_MissileEmp * 0.3);

            const mockContainer = createMockContainer(container, 250, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawAmmoStatus(mockContainer, mockShipDriver as never);
        },
    },

    'ammo-empty': {
        name: 'ammo-empty',
        description: 'Ammunition panel with no ammo',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.magazine.count_CannonHe = 0;
            ship.magazine.count_CannonAp = 0;
            ship.magazine.count_CannonFrag = 0;
            ship.magazine.count_MissileHe = 0;
            ship.magazine.count_MissileSabot = 0;
            ship.magazine.count_MissileCluster = 0;
            ship.magazine.count_MissileTandem = 0;
            ship.magazine.count_MissileEmp = 0;

            const mockContainer = createMockContainer(container, 250, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawAmmoStatus(mockContainer, mockShipDriver as never);
        },
    },
};
