import { dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawTubesStatus } from '../../widgets/tubes-status';

export const tubesStatusScenes: Record<string, Scene> = {
    'tubes-status-empty': {
        name: 'tubes-status-empty',
        description: 'Tubes status panel with no ammo loaded',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            for (const tube of ship.tubes.values()) {
                tube.projectile = 'None';
                tube.loadedProjectile = 'None';
                tube.loading = 0;
                tube.loadAmmo = false;
            }

            const mockContainer = createMockContainer(container, 350, 400);
            const mockShipDriver = createMockShipDriver(ship);

            drawTubesStatus(mockContainer, mockShipDriver as never);
        },
    },

    'tubes-status-loaded': {
        name: 'tubes-status-loaded',
        description: 'Tubes status panel with ammo loaded and ready to fire',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            for (const tube of ship.tubes.values()) {
                tube.projectile = 'HiExpShell';
                tube.loadedProjectile = 'HiExpShell';
                tube.loading = 1;
                tube.loadAmmo = true;
            }

            const mockContainer = createMockContainer(container, 350, 400);
            const mockShipDriver = createMockShipDriver(ship);

            drawTubesStatus(mockContainer, mockShipDriver as never);
        },
    },

    'tubes-status-cluster': {
        name: 'tubes-status-cluster',
        description: 'Tubes status panel with a cluster missile loaded, armor-piercing warhead selected',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            for (const tube of ship.tubes.values()) {
                tube.projectile = 'ClusterMissile';
                tube.loadedProjectile = 'ClusterMissile';
                tube.loading = 1;
                tube.loadAmmo = true;
                tube.clusterWarhead = 'ArmPen';
            }

            const mockContainer = createMockContainer(container, 350, 400);
            const mockShipDriver = createMockShipDriver(ship);

            drawTubesStatus(mockContainer, mockShipDriver as never);
        },
    },

    'tubes-status-loading': {
        name: 'tubes-status-loading',
        description: 'Tubes status panel with loading in progress',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            for (const tube of ship.tubes.values()) {
                tube.projectile = 'HiExpShell';
                tube.loadedProjectile = 'None';
                tube.loading = 0.2;
                tube.loadAmmo = true;
            }

            const mockContainer = createMockContainer(container, 350, 400);
            const mockShipDriver = createMockShipDriver(ship);

            drawTubesStatus(mockContainer, mockShipDriver as never);
        },
    },
};
