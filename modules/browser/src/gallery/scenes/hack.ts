import { demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawHack } from '../../widgets/hack';
import { settle } from '../mocks/fixtures';

function hackScene(name: string, description: string, hackSystem: string, progress: number, refusal = ''): Scene {
    return {
        name,
        description,
        async setup(container: HTMLElement) {
            document.body.dataset.station = 'signals';
            const ship = makeShipState('player', demoShip);
            ship.signals.hackSystem = hackSystem;
            ship.signals.hackProgress = progress;
            ship.signals.hackRefusal = refusal;
            drawHack(createMockContainer(container, 300, 300), snapshotShipDriver(ship));
            await settle();
        },
        teardown() {
            delete document.body.dataset.station;
        },
    };
}

export const hackScenes: Record<string, Scene> = {
    'hack-idle': hackScene(
        'hack-idle',
        'Hack pane with nothing running: thrusters and guns hackable, armor not',
        '',
        0,
    ),
    'hack-in-progress': hackScene('hack-in-progress', 'A hack on the target thrusters at 60%', 'thrusters', 0.6),
    'hack-lost-full': hackScene(
        'hack-lost-full',
        'A hack cancelled because the FULL scan lapsed',
        '',
        0,
        'FULL scan lost',
    ),
};
