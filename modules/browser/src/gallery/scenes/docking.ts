import { DockingMode, demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';
import { createMockShip, createMockSpaceDriver } from '../mocks/space-driver';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawDockingStatus } from '../../widgets/docking';
import { settle } from '../mocks/fixtures';

function dockingScene(name: string, description: string, mode: DockingMode, nearStation: boolean): Scene {
    return {
        name,
        description,
        async setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            const objects = [ship.spaceship];
            if (nearStation) {
                const station = createMockShip({ id: 'station-1', position: { x: 150, y: 0 } });
                station.model = 'small-station';
                station.radius = 100;
                objects.push(station);
                ship.docking.targetId = station.id;
            }
            ship.docking.mode = mode;
            drawDockingStatus(
                createMockContainer(container, 300, 150),
                createMockSpaceDriver(objects) as never,
                snapshotShipDriver(ship),
            );
            await settle();
        },
    };
}

export const dockingScenes: Record<string, Scene> = {
    'docking-undocked': dockingScene(
        'docking-undocked',
        'Docking panel in open space: no target, no option',
        DockingMode.UNDOCKED,
        false,
    ),
    'docking-docked': dockingScene(
        'docking-docked',
        'Docking panel docked to an adjacent station',
        DockingMode.DOCKED,
        true,
    ),
};
