import { AdminDriver, demoShip, makeShipState } from '@starwards/core';

import EventEmitter from 'eventemitter3';
import { Scene } from './index';
import { attachGameMessageOverlay } from '../../screens/station-lifecycle';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawAmmoStatus } from '../../widgets/ammo';

export const gameMessageScenes: Record<string, Scene> = {
    'game-message-banner': {
        name: 'game-message-banner',
        description: 'Queued GM message (AdminState.message) as a banner over a station panel, which stays visible',
        setup(container: HTMLElement) {
            const mockContainer = createMockContainer(container, 640, 300);
            drawAmmoStatus(mockContainer, createMockShipDriver(makeShipState('player', demoShip)) as never);
            const admin = {
                state: { message: 'Defeat: every station was lost during wave 3.' },
                events: new EventEmitter(),
            };
            attachGameMessageOverlay(mockContainer.getElement(), admin as unknown as AdminDriver);
        },
    },
};
