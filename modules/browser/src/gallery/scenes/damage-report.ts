import { demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';
import { makeDamagedShip, settle, settleUntil } from '../mocks/fixtures';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawDamageReport } from '../../widgets/damage-report';

export const damageReportScenes: Record<string, Scene> = {
    'damage-report-clear': {
        name: 'damage-report-clear',
        description: 'Damage report with nothing to report',
        async setup(container: HTMLElement) {
            drawDamageReport(
                createMockContainer(container, 260, 120),
                snapshotShipDriver(makeShipState('player', demoShip)),
            );
            await settle(100);
        },
    },
    'damage-report-faults': {
        name: 'damage-report-faults',
        description: 'Damage report listing an offline system and active defects',
        async setup(container: HTMLElement) {
            drawDamageReport(createMockContainer(container, 260, 300), snapshotShipDriver(makeDamagedShip()));
            await settleUntil(container, '.sw-damage__entry--caution');
        },
    },
};
