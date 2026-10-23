import { JobStatus, ScanLevel, SignalsJob, demoShip, makeShipState, snapshotShipDriver } from '@starwards/core';
import { createMockAsteroid, createMockShip, createMockSpaceDriver } from '../mocks/space-driver';

import { Scene } from './index';
import { SelectionContainer } from '../../radar/selection-container';
import { createMockContainer } from '../mocks/container';
import { drawSignalsJobs } from '../../widgets/signals-jobs';

type JobSetup = { targetId: string; status: JobStatus; progress?: number; prioritized?: boolean };

function signalsJobsScene(name: string, description: string, jobs: JobSetup[]): Scene {
    return {
        name,
        description,
        setup(container: HTMLElement) {
            document.body.dataset.station = 'signals';
            const ship = makeShipState('player', demoShip);
            const contact = createMockShip({ id: 'contact-7', position: { x: 2000, y: 0 }, faction: 2 });
            contact.scanLevels[ship.faction] = ScanLevel.BASIC;
            contact.model = 'dragonfly-MK1';
            const rock = createMockAsteroid({ id: 'rock-3', position: { x: 0, y: 2000 } });
            for (const [i, setup] of jobs.entries()) {
                const job = new SignalsJob();
                job.id = `job-${i}`;
                job.targetId = setup.targetId;
                job.status = setup.status;
                job.progress = setup.progress ?? 0;
                job.prioritized = setup.prioritized ?? false;
                ship.signals.jobs.push(job);
            }
            const spaceDriver = createMockSpaceDriver([ship.spaceship, contact, rock]);
            drawSignalsJobs(
                createMockContainer(container, 300, 400),
                snapshotShipDriver(ship),
                spaceDriver as never,
                new SelectionContainer(),
            );
        },
        teardown() {
            delete document.body.dataset.station;
        },
    };
}

export const signalsJobsScenes: Record<string, Scene> = {
    'signals-jobs-empty': signalsJobsScene('signals-jobs-empty', 'Signals job queue with no jobs', []),
    'signals-jobs-queue': signalsJobsScene(
        'signals-jobs-queue',
        'A prioritized scan in progress, one queued, one dormant (counted, not listed)',
        [
            { targetId: 'contact-7', status: JobStatus.IN_PROGRESS, progress: 0.35, prioritized: true },
            { targetId: 'rock-3', status: JobStatus.QUEUED },
            { targetId: 'unseen-9', status: JobStatus.DORMANT },
        ],
    ),
};
