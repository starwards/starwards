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

    @range([0, 1])
    @gameField('float32')
    progress = 0;

    @gameField('float32')
    duration = 0;
}
