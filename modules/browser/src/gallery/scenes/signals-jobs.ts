import { Faction, JobStatus, ScanLevel, SignalsJob, demoShip, makeShipState } from '@starwards/core';
import { createMockAsteroid, createMockShip, createMockSpaceDriver } from '../mocks/space-driver';

import { Scene } from './index';
import { SelectionContainer } from '../../radar/selection-container';
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

const PLAYER_FACTION = Faction.Gravitas;

export const signalsJobsScenes: Record<string, Scene> = {
    'signals-jobs-needs-beam': signalsJobsScene(
        'signals-jobs-needs-beam',
        'A deep scan stalled off the scan beam is listed as BEAM, apart from the dormant count',
        [
            { status: JobStatus.IN_PROGRESS, progress: 0.4 },
            { status: JobStatus.QUEUED },
            { status: JobStatus.DORMANT, needsBeam: true },
            { status: JobStatus.DORMANT },
        ],
    ),
    'signals-jobs-target-levels': {
        name: 'signals-jobs-target-levels',
        description:
            'Jobs pane with an active identification job (→BASIC), a queued deep scan (→FULL) and a queued identification (→BASIC)',
        setup(container: HTMLElement) {
            const player = makeShipState('player', demoShip);
            player.spaceship.faction = PLAYER_FACTION;

            const unknownRock = createMockAsteroid({ id: 'rock-1', position: { x: 10000, y: 0 } });
            unknownRock.scanLevels[PLAYER_FACTION] = ScanLevel.UFO;
            const identified = createMockShip({ id: 'ship-2', position: { x: 0, y: 12000 }, faction: Faction.NONE });
            identified.scanLevels[PLAYER_FACTION] = ScanLevel.BASIC;
            const unknownShip = createMockShip({ id: 'ship-3', position: { x: -9000, y: 0 }, faction: Faction.NONE });
            unknownShip.scanLevels[PLAYER_FACTION] = ScanLevel.UFO;

            const makeJob = (targetId: string, status: JobStatus, progress: number) => {
                const job = new SignalsJob();
                job.id = `job-${targetId}`;
                job.targetId = targetId;
                job.status = status;
                job.progress = progress;
                job.duration = 10;
                return job;
            };
            player.signals.jobs.push(
                makeJob('rock-1', JobStatus.IN_PROGRESS, 0.46),
                makeJob('ship-2', JobStatus.QUEUED, 0),
                makeJob('ship-3', JobStatus.QUEUED, 0),
            );

            const spaceDriver = createMockSpaceDriver([player.spaceship, unknownRock, identified, unknownShip]);
            const mockContainer = createMockContainer(container, 320, 360);
            drawSignalsJobs(
                mockContainer,
                createMockShipDriver(player) as never,
                spaceDriver as never,
                new SelectionContainer(),
            );
        },
    },
};
