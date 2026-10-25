import { ChainGun, demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawGunStatus } from '../../widgets/gun';

function gunScene(
    name: string,
    description: string,
    loading: number,
    isFiring: boolean,
    loadAmmo: boolean,
    tweak: (gun: ChainGun) => void = () => undefined,
): Scene {
    return {
        name,
        description,
        setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            const gun = ship.chainGuns[0];
            gun.loading = loading;
            gun.isFiring = isFiring;
            gun.loadAmmo = loadAmmo;
            tweak(gun);
            drawGunStatus(createMockContainer(container, 300, 380), snapshotShipDriver(ship));
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
    'gun-status-hot': gunScene(
        'gun-status-hot',
        'Hot chain gun with a worn barrel: bars lowered, spread growing',
        0.5,
        true,
        true,
        (gun) => {
            gun.heat = 68;
            gun.barrelWear = 0.5;
        },
    ),
    'gun-status-jammed': gunScene('gun-status-jammed', 'Jammed chain gun', 1, true, true, (gun) => {
        gun.heat = 88;
        gun.jammedSeconds = 2;
    }),
    'gun-status-cooling': gunScene(
        'gun-status-cooling',
        'Chain gun in forced cooldown with a worn barrel',
        0,
        false,
        true,
        (gun) => {
            gun.heat = 85;
            gun.cooling = true;
            gun.barrelWear = 0.8;
        },
    ),
};
