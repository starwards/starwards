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

            drawAmmoStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'ammo-low': {
        name: 'ammo-low',
        description: 'Ammunition panel with low ammo',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.magazine.count_CannonShell = Math.round(ship.magazine.max_CannonShell * 0.2);
            ship.magazine.count_BlastCannonShell = Math.round(ship.magazine.max_BlastCannonShell * 0.1);
            ship.magazine.count_Missile = Math.round(ship.magazine.max_Missile * 0.3);

            const mockContainer = createMockContainer(container, 250, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawAmmoStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'ammo-empty': {
        name: 'ammo-empty',
        description: 'Ammunition panel with no ammo',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.magazine.count_CannonShell = 0;
            ship.magazine.count_BlastCannonShell = 0;
            ship.magazine.count_Missile = 0;

            const mockContainer = createMockContainer(container, 250, 200);
            const mockShipDriver = createMockShipDriver(ship);

            drawAmmoStatus(mockContainer as never, mockShipDriver as never);
        },
    },
};
