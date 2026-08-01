import { Schema } from '@colyseus/schema';

import { gameField } from '../game-field';
import { range } from '../range';

export enum JobType {
    SCAN,
    HACK,
}

export enum JobStatus {
    QUEUED,
    IN_PROGRESS,
}

export class SignalsJob extends Schema {
    @gameField('string')
    id = '';

    @gameField('uint8')
    jobType: JobType = JobType.SCAN;

    @gameField('string')
    targetId = '';

    @gameField('string')
    hackSystemName = '';

    @gameField('uint8')
    status: JobStatus = JobStatus.QUEUED;

    /**
     * A job the user explicitly prioritized: never auto-pruned — when its target is out of
     * sight it lies dormant in place, so the queue order of prioritized jobs survives
     * sight loss (e.g. a radar restart).
     */
    @gameField('boolean')
    prioritized = false;

    @range([0, 1])
    @gameField('float32')
    progress = 0;

    @gameField('float32')
    duration = 0;
}
