import { demoShip, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawSmartGunStatus } from '../../widgets/smart-gun';

function smartGunScene(name: string, description: string, smartGunnery: boolean, status: string): Scene {
    return {
        name,
        description,
        setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            ship.smartGunnery = smartGunnery;
            ship.smartGunStatus = status;
            drawSmartGunStatus(createMockContainer(container, 250, 110), createMockShipDriver(ship) as never);
        },
    };
}

export const smartGunScenes: Record<string, Scene> = {
    'smart-gun-tracking': smartGunScene('smart-gun-tracking', 'Smart gun on, turrets tracking', true, 'tracking'),
    'smart-gun-resting': smartGunScene('smart-gun-resting', 'Smart gun on, target out of cone', true, 'resting'),
    'smart-gun-holding': smartGunScene('smart-gun-holding', 'Smart gun on, no target', true, 'holding'),
    'smart-gun-off': smartGunScene('smart-gun-off', 'Smart gun off, manual bearing', false, 'off'),
};
