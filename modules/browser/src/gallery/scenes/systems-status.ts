import { demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';
import { isHelmsSystem } from '../../screens/station-system-filters';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawFullSystemsStatus } from '../../widgets/full-system-status';
import { drawSystemsStatus } from '../../widgets/system-status';
import { makeDamagedShip } from '../mocks/fixtures';

function withStation(station: string, scene: Scene): Scene {
    return {
        ...scene,
        setup(container) {
            document.body.dataset.station = station;
            return scene.setup(container);
        },
        teardown() {
            delete document.body.dataset.station;
        },
    };
}

export const systemsStatusScenes: Record<string, Scene> = {
    'system-status-nominal': withStation('helms', {
        name: 'system-status-nominal',
        description: "Helms station's Systems pane with every system healthy",
        setup(container: HTMLElement) {
            const driver = snapshotShipDriver(makeShipState('player', demoShip));
            drawSystemsStatus(
                createMockContainer(container, 370, 300),
                driver,
                driver.systems.filter((s) => isHelmsSystem(s.pointer)),
            );
        },
    }),
    'system-status-faults': withStation('signals', {
        name: 'system-status-faults',
        description: 'Systems pane (fit width) showing broken, starved, hot, hacked and under-powered systems',
        setup(container: HTMLElement) {
            const driver = snapshotShipDriver(makeDamagedShip());
            drawSystemsStatus(createMockContainer(container, 300, 600), driver, driver.systems, true);
        },
    }),
    'full-system-status-engineer': withStation('engineer', {
        name: 'full-system-status-engineer',
        description: "Engineer station's Systems table: fault, power, heat, coolant, efficiency, hack and defect bars",
        setup(container: HTMLElement) {
            const driver = snapshotShipDriver(makeDamagedShip());
            drawFullSystemsStatus(createMockContainer(container, 560, 900), driver, driver.systems, true);
        },
    }),
    'full-system-status-wide': {
        name: 'full-system-status-wide',
        description: 'Wide Full Systems Status table (GM / ship dashboard) with labelled defect bars',
        setup(container: HTMLElement) {
            const driver = snapshotShipDriver(makeDamagedShip());
            drawFullSystemsStatus(createMockContainer(container, 600, 900), driver);
        },
    },
};
