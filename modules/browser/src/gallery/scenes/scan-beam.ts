import { Radar, demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawScanBeam } from '../../widgets/scan-beam';
import { settle } from '../mocks/fixtures';

function scanBeamScene(name: string, description: string, jamming: boolean, heat: number): Scene {
    return {
        name,
        description,
        async setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            const index = ship.radars.findIndex((r) => r.design.minArc < r.design.maxArc);
            const beam: Radar = ship.radars[index];
            beam.bearingCommand = 45;
            beam.jamming = jamming;
            beam.heat = heat;
            drawScanBeam(createMockContainer(container, 300, 250), snapshotShipDriver(ship), beam, `/radars/${index}`);
            await settle();
        },
    };
}

export const scanBeamScenes: Record<string, Scene> = {
    'scan-beam-steady': scanBeamScene(
        'scan-beam-steady',
        'Scan beam readout aimed at 045, cool, not jamming',
        false,
        0,
    ),
    'scan-beam-jamming': scanBeamScene('scan-beam-jamming', 'Scan beam readout jamming and running hot', true, 70),
};
