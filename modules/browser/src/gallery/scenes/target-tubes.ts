import { demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawTargetTubes } from '../../widgets/target-tubes';

export const targetTubesScenes: Record<string, Scene> = {
    'target-tubes-loading': {
        name: 'target-tubes-loading',
        description: "Target Details' read-only tube rows: a missile loaded, the next one 60% loaded",
        setup(container: HTMLElement) {
            const ship = makeShipState('target', demoShip);
            ship.tubes[0].loadedProjectile = 'HiExpMissile';
            ship.tubes[0].loading = 0.6;
            drawTargetTubes(createMockContainer(container, 300, 150), snapshotShipDriver(ship));
        },
    },
};
