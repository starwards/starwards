import { dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawTargetingStatus } from '../../widgets/targeting';

export const targetingScenes: Record<string, Scene> = {
    'targeting-no-target': {
        name: 'targeting-no-target',
        description: 'Targeting panel with no target selected',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.weaponsTarget.targetId = '';
            ship.weaponsTarget.shipOnly = false;
            ship.weaponsTarget.enemyOnly = false;
            ship.weaponsTarget.shortRangeOnly = false;

            const mockContainer = createMockContainer(container, 250, 180);
            const mockShipDriver = createMockShipDriver(ship);

            drawTargetingStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'targeting-ship-target': {
        name: 'targeting-ship-target',
        description: 'Targeting panel with a ship targeted',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.weaponsTarget.targetId = 'enemy-ship-001';
            ship.weaponsTarget.shipOnly = true;
            ship.weaponsTarget.enemyOnly = true;
            ship.weaponsTarget.shortRangeOnly = false;

            const mockContainer = createMockContainer(container, 250, 180);
            const mockShipDriver = createMockShipDriver(ship);

            drawTargetingStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'targeting-filters-active': {
        name: 'targeting-filters-active',
        description: 'Targeting panel with all filters active',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.weaponsTarget.targetId = '';
            ship.weaponsTarget.shipOnly = true;
            ship.weaponsTarget.enemyOnly = true;
            ship.weaponsTarget.shortRangeOnly = true;

            const mockContainer = createMockContainer(container, 250, 180);
            const mockShipDriver = createMockShipDriver(ship);

            drawTargetingStatus(mockContainer as never, mockShipDriver as never);
        },
    },
};
