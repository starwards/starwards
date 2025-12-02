import { WarpFrequency, dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawWarpStatus } from '../../widgets/warp';

export const warpScenes: Record<string, Scene> = {
    'warp-idle': {
        name: 'warp-idle',
        description: 'Warp panel in idle state (level 0, not jammed)',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.warp.currentLevel = 0;
            ship.warp.desiredLevel = 0;
            ship.warp.jammed = false;
            ship.warp.currentFrequency = WarpFrequency.W800HZ;
            ship.warp.standbyFrequency = WarpFrequency.W800HZ;
            ship.warp.frequencyChange = 0;

            const mockContainer = createMockContainer(container, 300, 250);
            const mockShipDriver = createMockShipDriver(ship);

            drawWarpStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'warp-jammed': {
        name: 'warp-jammed',
        description: 'Warp panel showing proximity jammed state',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.warp.currentLevel = 0;
            ship.warp.desiredLevel = 2;
            ship.warp.jammed = true;
            ship.warp.currentFrequency = WarpFrequency.W800HZ;
            ship.warp.standbyFrequency = WarpFrequency.W800HZ;
            ship.warp.frequencyChange = 0;

            const mockContainer = createMockContainer(container, 300, 250);
            const mockShipDriver = createMockShipDriver(ship);

            drawWarpStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'warp-calibrating': {
        name: 'warp-calibrating',
        description: 'Warp panel showing frequency calibration in progress',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.warp.currentLevel = 0;
            ship.warp.desiredLevel = 0;
            ship.warp.jammed = false;
            ship.warp.currentFrequency = WarpFrequency.W800HZ;
            ship.warp.standbyFrequency = WarpFrequency.W810HZ;
            ship.warp.frequencyChange = 0.5;

            const mockContainer = createMockContainer(container, 300, 250);
            const mockShipDriver = createMockShipDriver(ship);

            drawWarpStatus(mockContainer as never, mockShipDriver as never);
        },
    },

    'warp-active': {
        name: 'warp-active',
        description: 'Warp panel with active warp (level > 0)',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.warp.currentLevel = 3;
            ship.warp.desiredLevel = 3;
            ship.warp.jammed = false;
            ship.warp.currentFrequency = WarpFrequency.W790HZ;
            ship.warp.standbyFrequency = WarpFrequency.W790HZ;
            ship.warp.frequencyChange = 0;

            const mockContainer = createMockContainer(container, 300, 250);
            const mockShipDriver = createMockShipDriver(ship);

            drawWarpStatus(mockContainer as never, mockShipDriver as never);
        },
    },
};
