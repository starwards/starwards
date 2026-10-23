import { JobStatus, SignalsJob, demoShip, makeShipState } from '@starwards/core';
import { createMockShip, createMockSpaceDriver } from '../mocks/space-driver';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawSignalsJobs } from '../../widgets/signals-jobs';

type JobSetup = { status: JobStatus; progress?: number; needsBeam?: boolean };

/**
 * The Signals screen's Jobs pane. Job state is written directly — no SignalsJobManager ticks — so
 * every render is identical.
 */
function signalsJobsScene(name: string, description: string, jobs: JobSetup[]): Scene {
    return {
        name,
        description,
        setup(container: HTMLElement) {
            const ship = makeShipState('player', demoShip);
            const targets = jobs.map((_, i) => createMockShip({ id: `target-${i}`, faction: 1 }));
            jobs.forEach((setup, i) => {
                const job = new SignalsJob();
                job.id = `job-${i}`;
                job.targetId = `target-${i}`;
                job.status = setup.status;
                job.progress = setup.progress ?? 0;
                job.needsBeam = setup.needsBeam ?? false;
                job.duration = 5;
                ship.signals.jobs.push(job);
            });
            const mockContainer = createMockContainer(container, 320, 520);
            drawSignalsJobs(
                mockContainer,
                createMockShipDriver(ship) as never,
                createMockSpaceDriver(targets) as never,
                { getSingle: () => undefined } as never,
            );
        },
    };
}

export const signalsJobsScenes: Record<string, Scene> = {
    'signals-jobs-needs-beam': signalsJobsScene(
        'signals-jobs-needs-beam',
        'A deep scan stalled off the scan beam is listed as NEEDS BEAM, apart from the dormant count',
        [
            { status: JobStatus.IN_PROGRESS, progress: 0.4 },
            { status: JobStatus.QUEUED },
            { status: JobStatus.DORMANT, needsBeam: true },
            { status: JobStatus.DORMANT },
        ],
    ),
};
