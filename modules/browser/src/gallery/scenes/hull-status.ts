import { HullStatus } from '@starwards/core';
import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawHullStatus } from '../../widgets/hull-status';

const rows: HullStatus[] = [
    { id: '1', name: 'Station Alpha', allied: true, intel: 'LIVE', hull: 'intact', capsule: 'intact' },
    { id: '2', name: 'Wing 2', allied: true, intel: 'LIVE', hull: 'damaged', capsule: 'damaged' },
    { id: '3', name: 'Raider 3', allied: false, intel: 'LIVE', hull: 'damaged', capsule: 'critical' },
    {
        id: '4',
        name: 'Raider 4',
        allied: false,
        intel: 'SNAPSHOT',
        ageSeconds: 40,
        hull: 'critical',
        capsule: 'failing',
    },
    { id: '5', name: 'Wing 5', allied: true, intel: 'PENDING' },
];

export const hullStatusScenes: Record<string, Scene> = {
    'hull-status-mixed': {
        name: 'hull-status-mixed',
        description: 'Signals hull status: allies live, a FULL contact, a SNAPSHOT contact with age, a pending ally',
        setup(container: HTMLElement) {
            drawHullStatus(createMockContainer(container, 256, 420), () => rows);
        },
    },
    'hull-status-empty': {
        name: 'hull-status-empty',
        description: 'Signals hull status with no allies or scanned contacts',
        setup(container: HTMLElement) {
            drawHullStatus(createMockContainer(container, 256, 80), () => []);
        },
    },
};
