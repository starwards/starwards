import { SmartPilotMode, TargetedStatus, dragonflySF22, makeShipState } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawPilotStats } from '../../widgets/pilot';

export const pilotScenes: Record<string, Scene> = {
    'pilot-dashboard-stationary': {
        name: 'pilot-dashboard-stationary',
        description: 'Pilot dashboard with ship at rest',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            // ShipState extends Spaceship, so we can set velocity directly
            ship.velocity.x = 0;
            ship.velocity.y = 0;
            ship.angle = 0;
            ship.turnSpeed = 0;
            ship.smartPilot.rotationMode = SmartPilotMode.DIRECT;
            ship.smartPilot.maneuveringMode = SmartPilotMode.DIRECT;
            ship.smartPilot.rotation = 0;
            ship.smartPilot.maneuvering.x = 0;
            ship.smartPilot.maneuvering.y = 0;

            const mockContainer = createMockContainer(container, 300, 500);
            const mockShipDriver = createMockShipDriver(ship);

            drawPilotStats(mockContainer as never, mockShipDriver as never);
        },
    },

    'pilot-dashboard-moving': {
        name: 'pilot-dashboard-moving',
        description: 'Pilot dashboard with ship in motion',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.velocity.x = 100;
            ship.velocity.y = 50;
            ship.angle = 45;
            ship.turnSpeed = 15;
            ship.smartPilot.rotationMode = SmartPilotMode.VELOCITY;
            ship.smartPilot.maneuveringMode = SmartPilotMode.VELOCITY;
            ship.smartPilot.rotation = 0.5;
            ship.smartPilot.maneuvering.x = 0.8;
            ship.smartPilot.maneuvering.y = 0.3;
            ship.reactor.energy = 600;
            ship.maneuvering.afterBurnerFuel = 80;

            const mockContainer = createMockContainer(container, 300, 500);
            const mockShipDriver = createMockShipDriver(ship);

            drawPilotStats(mockContainer as never, mockShipDriver as never);
        },
    },

    'pilot-dashboard-target-mode': {
        name: 'pilot-dashboard-target-mode',
        description: 'Pilot dashboard with TARGET mode active',
        setup(container: HTMLElement) {
            const ship = makeShipState('player', dragonflySF22);
            ship.velocity.x = 200;
            ship.velocity.y = 0;
            ship.angle = 90;
            ship.turnSpeed = 0;
            ship.smartPilot.rotationMode = SmartPilotMode.TARGET;
            ship.smartPilot.maneuveringMode = SmartPilotMode.TARGET;
            ship.smartPilot.rotation = 0;
            ship.smartPilot.maneuvering.x = 1;
            ship.smartPilot.maneuvering.y = 0;
            ship.targeted = TargetedStatus.LOCKED;

            const mockContainer = createMockContainer(container, 300, 500);
            const mockShipDriver = createMockShipDriver(ship);

            drawPilotStats(mockContainer as never, mockShipDriver as never);
        },
    },
};
