import { demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawGunStatus } from '../../widgets/gun';

function gunScene(name: string, description: string, loading: number, isFiring: boolean, loadAmmo: boolean): Scene {
    return {
        name,
        description,
        setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            const gun = ship.chainGuns[0];
            gun.loading = loading;
            gun.isFiring = isFiring;
            gun.loadAmmo = loadAmmo;
            drawGunStatus(createMockContainer(container, 300, 250), snapshotShipDriver(ship));
        },
    };
}

export const gunScenes: Record<string, Scene> = {
    'gun-status-loading': gunScene(
        'gun-status-loading',
        'Chain gun half-way through loading, auto load on',
        0.5,
        false,
        true,
    ),
    'gun-status-firing': gunScene('gun-status-firing', 'Chain gun firing with auto load off', 0, true, false),
};
